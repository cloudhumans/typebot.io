import { describe, expect, it } from 'vitest'
import { computeJumpTrail } from './computeJumpTrail'

describe('computeJumpTrail', () => {
  it('maps each origin block to where it jumped, and collects the targets', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_b' },
    ])

    expect([...trail.targetGroupIdsByOriginBlockId]).toEqual([
      ['block_jump_1', ['group_a']],
      ['block_jump_2', ['group_b']],
    ])
    expect([...trail.targetGroupIds]).toEqual(['group_a', 'group_b'])
  })

  it('collapses several jumps landing in the same group', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_a' },
    ])

    expect(trail.targetGroupIdsByOriginBlockId.size).toBe(2)
    expect([...trail.targetGroupIds]).toEqual(['group_a'])
  })

  it('does not repeat a target when the same jump is recorded twice', () => {
    // The engine already dedupes on write; this keeps the tooltip from reading
    // `Jumped to "group_a", "group_a"` if that ever changes.
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
    ])

    expect(trail.targetGroupIdsByOriginBlockId.get('block_jump_1')).toEqual([
      'group_a',
    ])
  })

  it('keeps both targets when one block somehow jumped to two groups', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_1', toGroupId: 'group_b' },
    ])

    expect(trail.targetGroupIdsByOriginBlockId.get('block_jump_1')).toEqual([
      'group_a',
      'group_b',
    ])
  })

  it('returns empty lookups when no jump was taken', () => {
    const trail = computeJumpTrail([])

    expect(trail.targetGroupIdsByOriginBlockId.size).toBe(0)
    expect(trail.targetGroupIds.size).toBe(0)
  })
})
