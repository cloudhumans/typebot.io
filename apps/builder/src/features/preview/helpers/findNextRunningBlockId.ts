// Relative import (not the `@/` alias) so this helper stays loadable by the
// package-level unit-test runner, which has no alias wiring.
import { executionStatusBlockTypes } from '../../graph/constants'
import { TypebotV6 } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { isInputBlock } from '@typebot.io/schemas/helpers'

// Blocks that can divert the flow through a decision taken server-side (a false
// condition falls through to the next block, a jump lands in another group with
// no drawn edge, an AB test picks a branch at random). The client cannot know
// which path was taken during the round-trip, and treating them as fallthrough
// would put the spinner on a block that never ran — so the walk stops here.
const flowBranchingBlockTypes: string[] = [
  LogicBlockType.CONDITION,
  LogicBlockType.JUMP,
  LogicBlockType.AB_TEST,
  LogicBlockType.TYPEBOT_LINK,
  LogicBlockType.REDIRECT,
  LogicBlockType.VALIDATE_CPF,
  LogicBlockType.VALIDATE_CNPJ,
]

// Hard stop for the group walk, so a cycle we failed to detect can never hang
// the editor.
const maxHops = 100

/**
 * Starting from the answered input, walks the flow looking for the next
 * server-side integration block before the next input — that is where the
 * "running" spinner belongs during the round-trip.
 *
 * Returns `undefined` whenever the path cannot be known for sure: no spinner is
 * better than a spinner on a block that never runs.
 */
export const findNextRunningBlockId = ({
  typebot,
  answeredBlockId,
}: {
  typebot: TypebotV6
  answeredBlockId: string
}): string | undefined => {
  type Group = TypebotV6['groups'][number]

  // `groupOfBlock` resolves by block; `groupById` by group id — the latter is
  // what edges carry in `edge.to.groupId`.
  const groupOfBlock = (blockId: string) =>
    typebot.groups.find((g) => g.blocks.some((b) => b.id === blockId))
  const groupById = (groupId: string) =>
    typebot.groups.find((g) => g.id === groupId)
  // Edges leaving a block — either the default one (no itemId) or an item edge
  // (Buttons/Choice/Condition). We follow the edge actually taken when it is
  // the only one.
  const edgesFrom = (blockId: string) =>
    typebot.edges.filter(
      (edge) => 'blockId' in edge.from && edge.from.blockId === blockId
    )
  const entryIndex = (group: Group, blockId?: string) =>
    blockId
      ? Math.max(
          0,
          group.blocks.findIndex((b) => b.id === blockId)
        )
      : 0

  // Resolve where the flow goes from the answered input: if the block has
  // exactly one outgoing edge, follow it (item edges included); if it has
  // several (a branch), the path cannot be known client-side during the
  // server-side round-trip, so we don't guess. With no edge of its own, the flow
  // continues in the same group, on the next block.
  const answeredGroup = groupOfBlock(answeredBlockId)
  if (!answeredGroup) return undefined
  const answeredEdges = edgesFrom(answeredBlockId)
  if (answeredEdges.length > 1) return undefined
  let group: Group | undefined
  let index: number
  if (answeredEdges.length === 1) {
    group = groupById(answeredEdges[0].to.groupId)
    if (!group) return undefined
    index = entryIndex(group, answeredEdges[0].to.blockId)
  } else {
    group = answeredGroup
    index = answeredGroup.blocks.findIndex((b) => b.id === answeredBlockId) + 1
  }

  const visitedGroupIds = new Set<string>()
  for (let hop = 0; hop < maxHops; hop++) {
    if (!group || visitedGroupIds.has(group.id)) return undefined
    visitedGroupIds.add(group.id)
    let advanced = false
    for (let i = index; i < group.blocks.length; i++) {
      const block = group.blocks[i]
      if (executionStatusBlockTypes.includes(block.type)) return block.id
      // Next input: whatever runs after it belongs to another round-trip.
      if (isInputBlock(block)) return undefined
      // Server-side decision (condition/jump/AB test/...): path unknown.
      if (flowBranchingBlockTypes.includes(block.type)) return undefined
      const outgoing = edgesFrom(block.id)
      if (outgoing.length === 0) continue // keep going in the same group
      if (outgoing.length > 1) return undefined // branch -> unknown
      const nextGroup = groupById(outgoing[0].to.groupId)
      if (!nextGroup) return undefined
      group = nextGroup
      index = entryIndex(nextGroup, outgoing[0].to.blockId)
      advanced = true
      break
    }
    if (!advanced) return undefined // reached the end of the group without a redirect
  }
  return undefined
}
