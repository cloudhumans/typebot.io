import { TRPCError } from '@trpc/server'

export type FlowSnapshot = {
  groups: unknown
  edges: unknown
  events?: unknown
}

type LooseEdgeOwner = { id?: unknown; outgoingEdgeId?: unknown }
type LooseBlock = LooseEdgeOwner & { items?: unknown }
type LooseGroup = { id?: unknown; blocks?: unknown }
type LooseEdge = {
  id?: unknown
  to?: { groupId?: unknown; blockId?: unknown }
}

const MAX_LISTED_IDS = 10

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const listGroupIds = (groups: unknown): string[] =>
  asArray<LooseGroup>(groups)
    .map((group) => asString(group.id))
    .filter((id): id is string => id !== undefined)

export const findDanglingReferences = ({
  groups,
  edges,
  events,
}: FlowSnapshot): string[] => {
  const groupList = asArray<LooseGroup>(groups)
  const edgeList = asArray<LooseEdge>(edges)

  const blockIdsByGroup = new Map<string, Set<string>>()
  for (const group of groupList) {
    const groupId = asString(group.id)
    if (!groupId) continue
    blockIdsByGroup.set(
      groupId,
      new Set(
        asArray<LooseBlock>(group.blocks)
          .map((block) => asString(block.id))
          .filter((id): id is string => id !== undefined)
      )
    )
  }
  const edgeIds = new Set(
    edgeList
      .map((edge) => asString(edge.id))
      .filter((id): id is string => id !== undefined)
  )

  const dangling: string[] = []

  for (const edge of edgeList) {
    const edgeId = asString(edge.id) ?? '?'
    const targetGroupId = asString(edge.to?.groupId)
    const targetBlocks = targetGroupId
      ? blockIdsByGroup.get(targetGroupId)
      : undefined
    if (!targetBlocks) {
      dangling.push(`edge ${edgeId} -> group ${targetGroupId ?? '?'}`)
      continue
    }
    const targetBlockId = asString(edge.to?.blockId)
    if (targetBlockId && !targetBlocks.has(targetBlockId))
      dangling.push(`edge ${edgeId} -> block ${targetBlockId}`)
  }

  const checkOutgoing = (kind: string, owner: LooseEdgeOwner) => {
    const edgeId = asString(owner.outgoingEdgeId)
    if (edgeId && !edgeIds.has(edgeId))
      dangling.push(`${kind} ${asString(owner.id) ?? '?'} -> edge ${edgeId}`)
  }

  asArray<LooseEdgeOwner>(events).forEach((event) =>
    checkOutgoing('event', event)
  )
  for (const group of groupList)
    for (const block of asArray<LooseBlock>(group.blocks)) {
      checkOutgoing('block', block)
      asArray<LooseEdgeOwner>(block.items).forEach((item) =>
        checkOutgoing('item', item)
      )
    }

  return dangling
}

const listSome = (ids: string[]) =>
  ids.length > MAX_LISTED_IDS
    ? `${ids.slice(0, MAX_LISTED_IDS).join(', ')} and ${
        ids.length - MAX_LISTED_IDS
      } more`
    : ids.join(', ')

const WHOLESALE_RULE =
  '`groups`, `edges`, `variables` and `events` are replaced wholesale, never merged: resend the complete array read from getTypebot with your change applied. Do not delete edges or outgoingEdgeIds to satisfy this check.'

export const assertUpdatePreservesIntegrity = ({
  existing,
  resulting,
}: {
  existing: FlowSnapshot
  resulting: FlowSnapshot
}) => {
  const before = new Set(findDanglingReferences(existing))
  const introduced = findDanglingReferences(resulting).filter(
    (reference) => !before.has(reference)
  )
  if (introduced.length === 0) return

  const existingGroupIds = listGroupIds(existing.groups)
  const resultingGroupIds = new Set(listGroupIds(resulting.groups))
  const removedGroupIds = existingGroupIds.filter(
    (id) => !resultingGroupIds.has(id)
  )

  const headline =
    removedGroupIds.length > 0
      ? `This update would replace the flow's ${
          existingGroupIds.length
        } groups with ${resultingGroupIds.size}, removing ${listSome(
          removedGroupIds
        )}, and leave ${
          introduced.length
        } references pointing at groups, blocks or edges that would no longer exist.`
      : `This update would leave ${
          introduced.length
        } references pointing at groups, blocks or edges that would no longer exist (${listSome(
          introduced
        )}).`

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `${headline} ${WHOLESALE_RULE}`,
  })
}

const ACTION_MESSAGES = {
  create: (details: string) =>
    `Flow is inconsistent: ${details}. Every edges[].to.groupId must match a groups[].id and every outgoingEdgeId (events, blocks, items) must match an edges[].id.`,
  publish: (details: string) =>
    `Cannot publish: the draft is inconsistent (${details}). Restore the missing groups first, with rollbackTypebot to a consistent snapshot or updateTypebot with the complete flow.`,
  rollback: (details: string) =>
    `Cannot roll back to this snapshot: it is itself inconsistent (${details}). Pick a snapshot whose hasDanglingReferences is false.`,
} as const

export const assertFlowIntegrity = (
  flow: FlowSnapshot,
  action: keyof typeof ACTION_MESSAGES
) => {
  const dangling = findDanglingReferences(flow)
  if (dangling.length === 0) return
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: ACTION_MESSAGES[action](
      `${
        dangling.length
      } references point at groups, blocks or edges that do not exist: ${listSome(
        dangling
      )}`
    ),
  })
}
