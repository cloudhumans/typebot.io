import { TRPCError } from '@trpc/server'

export type FlowSnapshot = {
  groups: unknown
  edges: unknown
  events?: unknown
}

export type DanglingSeverity = 'hard' | 'soft'

export type DanglingKind = 'target' | 'source' | 'outgoing'

export type DanglingReference = {
  severity: DanglingSeverity
  kind: DanglingKind
  reference: string
  groupId?: string
  edgeId?: string
}

type LooseEdgeOwner = { id?: unknown; outgoingEdgeId?: unknown }
type LooseBlock = LooseEdgeOwner & { items?: unknown }
type LooseGroup = { id?: unknown; blocks?: unknown }
type LooseEdge = {
  id?: unknown
  from?: { blockId?: unknown; itemId?: unknown; eventId?: unknown }
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

const indexFlow = ({ groups, edges, events }: FlowSnapshot) => {
  const blockIdsByGroup = new Map<string, Set<string>>()
  const groupIdByBlock = new Map<string, string>()
  const itemIdsByBlock = new Map<string, Set<string>>()
  for (const group of asArray<LooseGroup>(groups)) {
    const groupId = asString(group.id)
    if (!groupId) continue
    const blockIds = new Set<string>()
    for (const block of asArray<LooseBlock>(group.blocks)) {
      const blockId = asString(block.id)
      if (!blockId) continue
      blockIds.add(blockId)
      groupIdByBlock.set(blockId, groupId)
      itemIdsByBlock.set(
        blockId,
        new Set(
          asArray<LooseEdgeOwner>(block.items)
            .map((item) => asString(item.id))
            .filter((id): id is string => id !== undefined)
        )
      )
    }
    blockIdsByGroup.set(groupId, blockIds)
  }
  const eventIds = new Set(
    asArray<LooseEdgeOwner>(events)
      .map((event) => asString(event.id))
      .filter((id): id is string => id !== undefined)
  )
  const edgeIds = new Set(
    asArray<LooseEdge>(edges)
      .map((edge) => asString(edge.id))
      .filter((id): id is string => id !== undefined)
  )
  return { blockIdsByGroup, groupIdByBlock, itemIdsByBlock, eventIds, edgeIds }
}

const edgeSourceResolves = (
  edge: LooseEdge,
  index: ReturnType<typeof indexFlow>
): boolean => {
  const eventId = asString(edge.from?.eventId)
  if (eventId) return index.eventIds.has(eventId)
  const blockId = asString(edge.from?.blockId)
  if (!blockId) return false
  const itemIds = index.itemIdsByBlock.get(blockId)
  if (!itemIds) return false
  const itemId = asString(edge.from?.itemId)
  return !itemId || itemIds.has(itemId)
}

export const findDanglingReferences = (
  flow: FlowSnapshot
): DanglingReference[] => {
  const index = indexFlow(flow)
  const dangling: DanglingReference[] = []

  for (const edge of asArray<LooseEdge>(flow.edges)) {
    const edgeId = asString(edge.id) ?? '?'
    const sourceBlockId = asString(edge.from?.blockId)
    const groupId = sourceBlockId
      ? index.groupIdByBlock.get(sourceBlockId)
      : undefined

    const targetGroupId = asString(edge.to?.groupId)
    const targetBlocks = targetGroupId
      ? index.blockIdsByGroup.get(targetGroupId)
      : undefined
    if (!targetBlocks)
      dangling.push({
        severity: 'hard',
        kind: 'target',
        reference: `edge ${edgeId} -> group ${targetGroupId ?? '?'}`,
        groupId,
      })
    else {
      const targetBlockId = asString(edge.to?.blockId)
      if (targetBlockId && !targetBlocks.has(targetBlockId))
        dangling.push({
          severity: 'hard',
          kind: 'target',
          reference: `edge ${edgeId} -> block ${targetBlockId}`,
          groupId,
        })
    }

    if (!edgeSourceResolves(edge, index)) {
      const source =
        asString(edge.from?.eventId) !== undefined
          ? `event ${asString(edge.from?.eventId)}`
          : asString(edge.from?.itemId) !== undefined
          ? `item ${asString(edge.from?.itemId)}`
          : `block ${sourceBlockId ?? '?'}`
      dangling.push({
        severity: 'soft',
        kind: 'source',
        reference: `edge ${edgeId} <- ${source}`,
        groupId,
      })
    }
  }

  const checkOutgoing = (
    kind: string,
    owner: LooseEdgeOwner,
    groupId?: string
  ) => {
    const edgeId = asString(owner.outgoingEdgeId)
    if (edgeId && !index.edgeIds.has(edgeId))
      dangling.push({
        severity: 'soft',
        kind: 'outgoing',
        reference: `${kind} ${asString(owner.id) ?? '?'} -> edge ${edgeId}`,
        groupId,
        edgeId,
      })
  }

  asArray<LooseEdgeOwner>(flow.events).forEach((event) =>
    checkOutgoing('event', event)
  )
  for (const group of asArray<LooseGroup>(flow.groups)) {
    const groupId = asString(group.id)
    for (const block of asArray<LooseBlock>(group.blocks)) {
      checkOutgoing('block', block, groupId)
      asArray<LooseEdgeOwner>(block.items).forEach((item) =>
        checkOutgoing('item', item, groupId)
      )
    }
  }

  return dangling
}

const stripOutgoing = <T extends LooseEdgeOwner>(
  owner: T,
  edgeIds: Set<string>
): T => {
  const edgeId = asString(owner.outgoingEdgeId)
  if (!edgeId || edgeIds.has(edgeId)) return owner
  const rest = { ...owner }
  delete rest.outgoingEdgeId
  return rest
}

export const dropSourcelessEdges = (flow: FlowSnapshot): unknown => {
  if (!Array.isArray(flow.edges)) return flow.edges
  const index = indexFlow(flow)
  const edges = asArray<LooseEdge>(flow.edges)
  const kept = edges.filter((edge) => edgeSourceResolves(edge, index))
  return kept.length === edges.length ? flow.edges : kept
}

export const sanitizeSoftReferences = (flow: FlowSnapshot): FlowSnapshot => {
  const edges = dropSourcelessEdges(flow)
  const edgeIds = new Set(
    asArray<LooseEdge>(edges)
      .map((edge) => asString(edge.id))
      .filter((id): id is string => id !== undefined)
  )
  const groups = Array.isArray(flow.groups)
    ? asArray<LooseGroup>(flow.groups).map((group) => ({
        ...group,
        blocks: asArray<LooseBlock>(group.blocks).map((block) => {
          const stripped = stripOutgoing(block, edgeIds)
          return Array.isArray(block.items)
            ? {
                ...stripped,
                items: asArray<LooseEdgeOwner>(block.items).map((item) =>
                  stripOutgoing(item, edgeIds)
                ),
              }
            : stripped
        }),
      }))
    : flow.groups
  const events = Array.isArray(flow.events)
    ? asArray<LooseEdgeOwner>(flow.events).map((event) =>
        stripOutgoing(event, edgeIds)
      )
    : flow.events
  return { groups, edges, events }
}

const listSome = (ids: string[]) =>
  ids.length > MAX_LISTED_IDS
    ? `${ids.slice(0, MAX_LISTED_IDS).join(', ')} and ${
        ids.length - MAX_LISTED_IDS
      } more`
    : ids.join(', ')

const WHOLESALE_RULE =
  '`groups`, `edges`, `variables` and `events` are replaced wholesale, never merged: re-read the flow with getTypebot and resend the complete array with your change applied. Do not delete edges or outgoingEdgeIds to satisfy this check.'

export const assertUpdatePreservesIntegrity = ({
  existing,
  resulting,
}: {
  existing: FlowSnapshot
  resulting: FlowSnapshot
}) => {
  const before = new Set(
    findDanglingReferences(existing).map((item) => item.reference)
  )
  const existingEdgeIds = new Set(
    asArray<LooseEdge>(existing.edges)
      .map((edge) => asString(edge.id))
      .filter((id): id is string => id !== undefined)
  )
  const introduced = findDanglingReferences(resulting)
    .filter((item) => item.kind !== 'source')
    .filter(
      (item) =>
        item.kind !== 'outgoing' ||
        (item.edgeId !== undefined && existingEdgeIds.has(item.edgeId))
    )
    .map((item) => item.reference)
    .filter((reference) => !before.has(reference))
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

const ACTIONS = {
  create: {
    scope: 'all',
    message: (details: string) =>
      `Flow is inconsistent: ${details}. Every edges[].to.groupId must match a groups[].id, every edges[].from must reference an existing event, block or item, and every outgoingEdgeId (events, blocks, items) must match an edges[].id.`,
  },
  import: {
    scope: 'hard',
    message: (details: string) =>
      `Cannot import this flow: it is inconsistent (${details}). Every edges[].to.groupId must match a groups[].id.`,
  },
  publish: {
    scope: 'hard',
    message: (details: string) =>
      `Cannot publish: the draft is inconsistent (${details}). Restore the missing groups first, with rollbackTypebot to a consistent snapshot or updateTypebot with the complete flow.`,
  },
  rollback: {
    scope: 'hard',
    message: (details: string) =>
      `Cannot roll back to this snapshot: it is itself inconsistent (${details}). Pick a snapshot whose hasDanglingReferences is false.`,
  },
} as const

export const assertFlowIntegrity = (
  flow: FlowSnapshot,
  action: keyof typeof ACTIONS
) => {
  const { scope, message } = ACTIONS[action]
  const dangling = findDanglingReferences(flow)
    .filter((item) => scope === 'all' || item.severity === 'hard')
    .map((item) => item.reference)
  if (dangling.length === 0) return
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: message(
      `${
        dangling.length
      } references point at groups, blocks or edges that do not exist: ${listSome(
        dangling
      )}`
    ),
  })
}
