import {
  Group,
  Block,
  IdMap,
  Target,
  BlockSource,
  TEventSource,
} from '@typebot.io/schemas'

export type Coordinates = { x: number; y: number }

export type Anchor = {
  coordinates: Coordinates
}

export type Node = Omit<Group, 'blocks'> & {
  blocks: (Block & {
    sourceAnchorsPosition: { left: Coordinates; right: Coordinates }
  })[]
}

export type ConnectingIds = {
  source: TEventSource | (BlockSource & { groupId: string })
  target?: Target
}

export type CoordinatesMap = IdMap<Coordinates>

export type AnchorsPositionProps = {
  sourcePosition: Coordinates
  targetPosition: Coordinates
  sourceType: 'right' | 'left'
  totalSegments: number
}

export type Endpoint = {
  id: string
  y: number
}

// Trail of the Test preview execution, derived once per chat response instead of
// recomputed by every edge/group on every render. The raw visited-edge list is
// cumulative and unbounded, so scanning it per component made the editor degrade
// as a Test session went on.
export type ExecutionTrail = {
  // How many times each edge was traversed — drives the "×N" label.
  edgeVisitCounts: Record<string, number>
  // Last edge traversed, for the marching-ants animation.
  lastTraversedEdgeId?: string
  // Groups the trail enters, for the orange card border.
  visitedGroupIds: Set<string>
}

export const createEmptyExecutionTrail = (): ExecutionTrail => ({
  edgeVisitCounts: {},
  visitedGroupIds: new Set(),
})
