import { describe, expect, it } from 'vitest'
import { computeJumpTrail } from './computeJumpTrail'

describe('computeJumpTrail', () => {
  it('splits the jumps into origin blocks and target groups', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_b' },
    ])

    expect([...trail.originBlockIds]).toEqual(['block_jump_1', 'block_jump_2'])
    expect([...trail.targetGroupIds]).toEqual(['group_a', 'group_b'])
  })

  it('collapses several jumps landing in the same group', () => {
    const trail = computeJumpTrail([
      { fromBlockId: 'block_jump_1', toGroupId: 'group_a' },
      { fromBlockId: 'block_jump_2', toGroupId: 'group_a' },
    ])

    expect(trail.originBlockIds.size).toBe(2)
    expect([...trail.targetGroupIds]).toEqual(['group_a'])
  })

  it('returns empty lookups when no jump was taken', () => {
    const trail = computeJumpTrail([])

    expect(trail.originBlockIds.size).toBe(0)
    expect(trail.targetGroupIds.size).toBe(0)
  })
})
