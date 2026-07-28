import { ExecutionTrail } from '@/features/graph/types'
import { Edge } from '@typebot.io/schemas'

/**
 * Turns the cumulative list of traversed edge ids into the lookups the graph
 * actually renders from.
 *
 * Runs once per chat response, in O(visited + edges). Doing it here instead of
 * inside `Edge`/`GroupNode` is what keeps the editor responsive: those render
 * once per edge and once per group, so scanning the (unbounded) visited list
 * there was quadratic in the size of the flow times the length of the session.
 */
export const computeExecutionTrail = ({
  visitedEdgeIds,
  edges,
}: {
  visitedEdgeIds: string[]
  edges: Edge[]
}): ExecutionTrail => {
  const edgeVisitCounts: Record<string, number> = {}
  for (const edgeId of visitedEdgeIds)
    edgeVisitCounts[edgeId] = (edgeVisitCounts[edgeId] ?? 0) + 1

  // A group is part of the trail when a visited edge points into it. Edges the
  // editor doesn't know about (virtual jump edges) are skipped, same as before.
  const visitedGroupIds = new Set<string>()
  for (const edge of edges)
    if (edgeVisitCounts[edge.id]) visitedGroupIds.add(edge.to.groupId)

  return {
    edgeVisitCounts,
    lastTraversedEdgeId: visitedEdgeIds[visitedEdgeIds.length - 1],
    visitedGroupIds,
  }
}
