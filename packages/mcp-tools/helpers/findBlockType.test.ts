import { describe, it, expect } from 'vitest'
import { findBlockType } from './findBlockType'

const typebot = {
  groups: [
    { blocks: [{ id: 'b1', type: 'Declare variables' }] },
    {
      blocks: [
        { id: 'b2', type: 'Webhook' },
        { id: 'b3', type: 'workflow' },
      ],
    },
  ],
}

describe('findBlockType', () => {
  it('returns the type of the block with the given id', () => {
    expect(findBlockType(typebot, 'b2')).toBe('Webhook')
  })

  it('returns undefined for an unknown id or no id', () => {
    expect(findBlockType(typebot, 'nope')).toBeUndefined()
    expect(findBlockType(typebot, undefined)).toBeUndefined()
  })
})
