import { addEdgeToTypebot, createPortalEdge } from '../../../addEdgeToTypebot'
import { ExecuteLogicResponse } from '../../../types'
import { TRPCError } from '@trpc/server'
import { SessionState } from '@typebot.io/schemas'
import { JumpBlock } from '@typebot.io/schemas/features/blocks/logic/jump'

export const executeJumpBlock = (
  state: SessionState,
  block: JumpBlock
): ExecuteLogicResponse => {
  const { groupId, blockId } = block.options ?? {}
  if (!groupId) return { outgoingEdgeId: undefined }
  const { typebot } = state.typebotsQueue[0]
  const groupToJumpTo = typebot.groups.find((group) => group.id === groupId)
  const blockToJumpTo =
    groupToJumpTo?.blocks.find((block) => block.id === blockId) ??
    groupToJumpTo?.blocks[0]

  if (!blockToJumpTo) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Block to jump to is not found. groupId: ${
        groupId ?? 'undefined'
      }, blockId: ${blockId ?? 'undefined'}`,
    })
  }

  const portalEdge = createPortalEdge({
    to: { groupId, blockId: blockToJumpTo?.id },
  })
  let newSessionState = addEdgeToTypebot(state, portalEdge)

  // Preview: a jump travels through a virtual edge (no line in the editor).
  // Records both ends — the block the flow left from and the group it landed in
  // — so the builder can flag the loop-back on either side. Deduped on write by
  // the pair: the builder only needs the set of jumps, and a loop going through
  // the same jump 50 times would otherwise store it 50 times — in the session
  // state *and* in every `continueChat` response.
  if (!newSessionState.typebotsQueue[0].resultId) {
    const jumps = newSessionState.previewMetadata?.jumps ?? []
    const isAlreadyRecorded = jumps.some(
      (jump) => jump.fromBlockId === block.id && jump.toGroupId === groupId
    )
    if (!isAlreadyRecorded)
      newSessionState = {
        ...newSessionState,
        previewMetadata: {
          ...newSessionState.previewMetadata,
          jumps: [...jumps, { fromBlockId: block.id, toGroupId: groupId }],
        },
      }
  }

  return { outgoingEdgeId: portalEdge.id, newSessionState }
}
