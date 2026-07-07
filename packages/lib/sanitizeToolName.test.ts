import { describe, it, expect } from 'vitest'
import { sanitizeToolName } from './sanitizeToolName'

describe('sanitizeToolName', () => {
  it('lowercases and replaces spaces with a single underscore', () => {
    expect(sanitizeToolName('Get Order Status')).toBe('get_order_status')
  })

  it('keeps existing underscores and hyphens', () => {
    expect(sanitizeToolName('get_order-status')).toBe('get_order-status')
  })

  it('collapses runs of separators and trims leading/trailing ones', () => {
    expect(sanitizeToolName('  Get   Order!! ')).toBe('get_order')
  })

  it('returns an empty string when nothing survives normalization', () => {
    expect(sanitizeToolName('!!!')).toBe('')
    expect(sanitizeToolName('   ')).toBe('')
    expect(sanitizeToolName('@#$%')).toBe('')
  })
})
