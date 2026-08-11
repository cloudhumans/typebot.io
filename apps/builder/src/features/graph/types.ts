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

// Jumps taken during the Test, reduced to lookups for the same reason as
// `ExecutionTrail`: the raw list is cumulative, and every block and every group
// checks it on every render.
export type JumpTrail = {
  // Jump blocks the flow actually left from — badged as the jump origin.
  originBlockIds: Set<string>
  // Groups a jump landed in — badged as the jump target, and part of the trail
  // highlight even though no drawn edge points into them.
  targetGroupIds: Set<string>
}

export const createEmptyJumpTrail = (): JumpTrail => ({
  originBlockIds: new Set(),
  targetGroupIds: new Set(),
})
