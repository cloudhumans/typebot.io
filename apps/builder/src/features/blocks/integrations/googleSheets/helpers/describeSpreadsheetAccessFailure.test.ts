import { describe, expect, it, vi } from 'vitest'
import type { OAuth2Client } from 'google-auth-library'
import { describeSpreadsheetAccessFailure } from './describeSpreadsheetAccessFailure'

const client = () =>
  ({
    getAccessToken: vi.fn(async () => ({ token: 'ya29.x' })),
    getTokenInfo: vi.fn(async () => ({ email: 'owner@acme.com' })),
  } as unknown as OAuth2Client)

describe('describeSpreadsheetAccessFailure', () => {
  it('names the real account on a 403', async () => {
    const googleClient = client()
    expect(
      await describeSpreadsheetAccessFailure(
        { response: { status: 403 } },
        googleClient,
        'Custom name'
      )
    ).toEqual({ error: 'FORBIDDEN', accountEmail: 'owner@acme.com' })
  })

  it.each([
    [{ response: { status: 404 } }, 'NOT_FOUND'],
    [{ response: { status: 401 } }, 'UNAUTHORIZED'],
    [
      {
        message: 'This operation is not supported for this document',
        response: { status: 400 },
      },
      'UNSUPPORTED_DOCUMENT',
    ],
    [{ response: { status: 500 } }, 'UNKNOWN'],
  ])('skips the token lookup for %j (%s)', async (err, expectedError) => {
    const googleClient = client()
    expect(
      await describeSpreadsheetAccessFailure(err, googleClient, 'Custom name')
    ).toEqual({ error: expectedError, accountEmail: 'Custom name' })
    expect(googleClient.getAccessToken).not.toHaveBeenCalled()
  })
})
