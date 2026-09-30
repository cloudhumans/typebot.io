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

  it('falls back to a numeric code when there is no response', () => {
    expect(classifyGoogleSheetsError({ code: 403 })).toBe('FORBIDDEN')
  })

  it('reads the status of a gaxios error, whose code is a string', () => {
    expect(
      classifyGoogleSheetsError({
        code: 'ERR_BAD_REQUEST',
        response: { status: 404 },
      })
    ).toBe('NOT_FOUND')
  })

  it('classifies a 401 as UNAUTHORIZED', () => {
    expect(classifyGoogleSheetsError({ response: { status: 401 } })).toBe(
      'UNAUTHORIZED'
    )
  })

  it('classifies a revoked refresh token (invalid_grant) as UNAUTHORIZED', () => {
    expect(
      classifyGoogleSheetsError({
        message: 'invalid_grant',
        response: { status: 400, data: { error: 'invalid_grant' } },
      })
    ).toBe('UNAUTHORIZED')
  })

  it('classifies a non-native file (e.g. .xlsx) as UNSUPPORTED_DOCUMENT', () => {
    expect(
      classifyGoogleSheetsError({
        message:
          'Google API error - [400] This operation is not supported for this document',
        response: { status: 400 },
      })
    ).toBe('UNSUPPORTED_DOCUMENT')
  })

  it('keeps other 400s as UNKNOWN', () => {
    expect(
      classifyGoogleSheetsError({
        message: 'Unable to parse range',
        response: { status: 400 },
      })
    ).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for other statuses and non-objects', () => {
    expect(classifyGoogleSheetsError({ response: { status: 500 } })).toBe(
      'UNKNOWN'
    )
    expect(classifyGoogleSheetsError(new Error('boom'))).toBe('UNKNOWN')
    expect(classifyGoogleSheetsError(undefined)).toBe('UNKNOWN')
  })
})
