import { describe, expect, it } from 'vitest'
import { computeJumpTrail } from './computeJumpTrail'

describe('computeJumpTrail', () => {
  it('collects the origin blocks and maps each target to where it came from', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_b' },
    ])

    expect([...trail.originBlockIds]).toEqual(['block_jump_1', 'block_jump_2'])
    expect([...trail.originBlockIdsByTargetGroupId]).toEqual([
      ['group_a', ['block_jump_1']],
      ['group_b', ['block_jump_2']],
    ])
  })

  it('keeps every origin of a group two different jumps landed in', () => {
    // The real case this was written for: both Jump blocks of a loop point back
    // at the same card, so its badge has to name both.
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_a' },
    ])

    expect(trail.originBlockIdsByTargetGroupId.get('group_a')).toEqual([
      'block_jump_1',
      'block_jump_2',
    ])
  })

  it('does not repeat an origin when the same jump is recorded twice', () => {
    // The engine already dedupes on write; this keeps the tooltip from reading
    // `Jumped from "X", "X"` if that ever changes.
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
    ])

    expect(trail.originBlockIdsByTargetGroupId.get('group_a')).toEqual([
      'block_jump_1',
    ])
  })

  it('exposes the target groups as the map keys, for the trail border', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
    ])

    expect(trail.originBlockIdsByTargetGroupId.has('group_a')).toBe(true)
    expect(trail.originBlockIdsByTargetGroupId.has('group_b')).toBe(false)
  })

  it('returns empty lookups when no jump was taken', () => {
    const trail = computeJumpTrail([])

    expect(trail.originBlockIds.size).toBe(0)
    expect(trail.originBlockIdsByTargetGroupId.size).toBe(0)
  })
})
