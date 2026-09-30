import { describe, expect, it, vi } from 'vitest'
import type { OAuth2Client } from 'google-auth-library'
import { getCredentialsAccountEmail } from './getCredentialsAccountEmail'

const clientWith = ({
  token,
  email,
  fails,
}: {
  token?: string | null
  email?: string
  fails?: 'getAccessToken' | 'getTokenInfo'
}) =>
  ({
    getAccessToken: vi.fn(async () => {
      if (fails === 'getAccessToken') throw new Error('invalid_grant')
      return { token }
    }),
    getTokenInfo: vi.fn(async () => {
      if (fails === 'getTokenInfo') throw new Error('boom')
      return { email }
    }),
  } as unknown as OAuth2Client)

describe('getCredentialsAccountEmail', () => {
  it('returns the email the token belongs to', async () => {
    const client = clientWith({ token: 'ya29.x', email: 'owner@acme.com' })
    expect(await getCredentialsAccountEmail(client, 'Custom name')).toBe(
      'owner@acme.com'
    )
  })

  it('falls back when there is no access token', async () => {
    const client = clientWith({ token: null })
    expect(await getCredentialsAccountEmail(client, 'Custom name')).toBe(
      'Custom name'
    )
    expect(client.getTokenInfo).not.toHaveBeenCalled()
  })

  it('falls back when the token info has no email', async () => {
    const client = clientWith({ token: 'ya29.x' })
    expect(await getCredentialsAccountEmail(client, 'Custom name')).toBe(
      'Custom name'
    )
  })

  it('falls back when refreshing the token throws', async () => {
    const client = clientWith({ fails: 'getAccessToken' })
    expect(await getCredentialsAccountEmail(client, 'Custom name')).toBe(
      'Custom name'
    )
  })

  it('falls back when the token info lookup throws', async () => {
    const client = clientWith({ token: 'ya29.x', fails: 'getTokenInfo' })
    expect(await getCredentialsAccountEmail(client, 'Custom name')).toBe(
      'Custom name'
    )
  })
})
