// Relative import (not the `@/` alias) so this helper stays loadable by the
// package-level unit-test runner, which has no alias wiring.
import { JumpTrail } from '../../graph/types'
import { PreviewJump } from '@typebot.io/schemas'

/**
 * Splits the cumulative list of jumps taken in the Test into the two lookups the
 * graph renders from: which blocks a jump left from, and — for each group a jump
 * landed in — which blocks jumped into it, so the target badge can name where
 * the flow came from.
 *
 * Runs once per chat response, like `computeExecutionTrail` — every block and
 * every group asks about this, so the answer has to be O(1) at render time.
 */
export const computeJumpTrail = (jumps: PreviewJump[]): JumpTrail => {
  const originBlockIds = new Set<string>()
  const originBlockIdsByTargetGroupId = new Map<string, string[]>()
  for (const jump of jumps) {
    originBlockIds.add(jump.fromBlockId)
    const origins = originBlockIdsByTargetGroupId.get(jump.toGroupId)
    if (!origins)
      originBlockIdsByTargetGroupId.set(jump.toGroupId, [jump.fromBlockId])
    else if (!origins.includes(jump.fromBlockId)) origins.push(jump.fromBlockId)
  }
  return { originBlockIds, originBlockIdsByTargetGroupId }
}
