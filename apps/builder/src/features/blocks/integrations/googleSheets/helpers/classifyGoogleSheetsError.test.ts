import { describe, expect, it } from 'vitest'
import { classifyGoogleSheetsError } from './classifyGoogleSheetsError'

describe('classifyGoogleSheetsError', () => {
  it('classifies an axios 403 as FORBIDDEN', () => {
    expect(classifyGoogleSheetsError({ response: { status: 403 } })).toBe(
      'FORBIDDEN'
    )
  })

  it('classifies an axios 404 as NOT_FOUND', () => {
    expect(classifyGoogleSheetsError({ response: { status: 404 } })).toBe(
      'NOT_FOUND'
    )
  })

  it('falls back to a numeric code (gaxios style)', () => {
    expect(classifyGoogleSheetsError({ code: 403 })).toBe('FORBIDDEN')
  })

  it('ignores string codes like ERR_BAD_REQUEST', () => {
    expect(classifyGoogleSheetsError({ code: 'ERR_BAD_REQUEST' })).toBe(
      'UNKNOWN'
    )
  })

  it('returns UNKNOWN for other statuses and non-objects', () => {
    expect(classifyGoogleSheetsError({ response: { status: 500 } })).toBe(
      'UNKNOWN'
    )
    expect(classifyGoogleSheetsError(new Error('boom'))).toBe('UNKNOWN')
    expect(classifyGoogleSheetsError(undefined)).toBe('UNKNOWN')
  })
})
