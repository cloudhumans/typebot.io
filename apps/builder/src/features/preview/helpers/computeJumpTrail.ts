// Relative import (not the `@/` alias) so this helper stays loadable by the
// package-level unit-test runner, which has no alias wiring.
import { JumpTrail } from '../../graph/types'
import { PreviewJump } from '@typebot.io/schemas'

/**
 * Splits the cumulative list of jumps taken in the Test into the two lookups the
 * graph renders from: which blocks a jump left from, and which groups a jump
 * landed in.
 *
 * Runs once per chat response, like `computeExecutionTrail` — every block and
 * every group asks about this, so the answer has to be O(1) at render time.
 */
export const computeJumpTrail = (jumps: PreviewJump[]): JumpTrail => {
  const originBlockIds = new Set<string>()
  const targetGroupIds = new Set<string>()
  for (const jump of jumps) {
    originBlockIds.add(jump.fromBlockId)
    targetGroupIds.add(jump.toGroupId)
  }
  return { originBlockIds, targetGroupIds }
}
