import { describe, expect, it } from 'vitest'
import { settingsSchema } from './schema'

describe('settingsSchema general.type', () => {
  it('accepts CONTEXT_ENRICHMENT', () => {
    const result = settingsSchema.safeParse({
      general: { type: 'CONTEXT_ENRICHMENT' },
    })
    expect(result.success).toBe(true)
  })

  it('still accepts TOOL and default', () => {
    expect(
      settingsSchema.safeParse({ general: { type: 'TOOL' } }).success
    ).toBe(true)
    expect(
      settingsSchema.safeParse({ general: { type: 'default' } }).success
    ).toBe(true)
  })

  it('rejects unknown types', () => {
    const result = settingsSchema.safeParse({
      general: { type: 'ENRICHMENT' },
    })
    expect(result.success).toBe(false)
  })
})
