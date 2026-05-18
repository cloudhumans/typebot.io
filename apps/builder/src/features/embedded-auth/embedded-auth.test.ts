import { vi } from 'vitest'

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpcVanilla: {
    verifyEmbeddedToken: {
      mutate: vi.fn(),
    },
  },
}))

vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { signIn, signOut } from 'next-auth/react'
import { trpcVanilla } from '@/lib/trpc'
import logger from '@/helpers/logger'
import {
  buildEmbeddedCallbackUrl,
  handleEmbeddedAuthentication,
} from './embedded-auth'

const signInMock = signIn as unknown as ReturnType<typeof vi.fn>
const signOutMock = signOut as unknown as ReturnType<typeof vi.fn>
const verifyEmbeddedTokenMock = trpcVanilla.verifyEmbeddedToken
  .mutate as unknown as ReturnType<typeof vi.fn>
const loggerErrorMock = logger.error as unknown as ReturnType<typeof vi.fn>

const SHORT_CALLBACK = 'https://eddie.test/typebots'

describe('buildEmbeddedCallbackUrl', () => {
  it('returns origin + pathname without the search/hash that carry the JWT', () => {
    const url = buildEmbeddedCallbackUrl({
      origin: 'https://eddie.test',
      pathname: '/typebots/abc-123/edit',
    })
    expect(url).toBe('https://eddie.test/typebots/abc-123/edit')
    expect(url).not.toContain('jwt')
  })

  it('handles root pathname', () => {
    const url = buildEmbeddedCallbackUrl({
      origin: 'https://eddie.test',
      pathname: '/',
    })
    expect(url).toBe('https://eddie.test/')
  })

  it('stays under 256 bytes for typical hosts and paths', () => {
    const url = buildEmbeddedCallbackUrl({
      origin: 'https://eddie.us-east-1.prd.cloudhumans.io',
      pathname: '/typebots/cmkjzi2631gkwd25qv1h9egow/edit',
    })
    // Keeps response Set-Cookie well under Kong's default 4 KB proxy_buffer_size.
    expect(url.length).toBeLessThan(256)
  })
})

describe('handleEmbeddedAuthentication', () => {
  beforeEach(() => {
    signInMock.mockReset()
    signOutMock.mockReset()
    verifyEmbeddedTokenMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('passes a JWT-free callbackUrl to signIn', async () => {
    signInMock.mockResolvedValue({ ok: true })

    const result = await handleEmbeddedAuthentication({
      session: null,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    expect(result).toBe(true)
    expect(signInMock).toHaveBeenCalledTimes(1)
    const [provider, options] = signInMock.mock.calls[0]
    expect(provider).toBe('cloudchat-embedded')
    expect(options).toMatchObject({
      token: 'cognito.jwt.value',
      redirect: false,
      callbackUrl: SHORT_CALLBACK,
    })
  })

  it('regression guard: never forwards a callbackUrl carrying the JWT', async () => {
    signInMock.mockResolvedValue({ ok: true })

    await handleEmbeddedAuthentication({
      session: null,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    const options = signInMock.mock.calls[0][1] as { callbackUrl: string }
    expect(options.callbackUrl).not.toContain('jwt=')
    expect(options.callbackUrl).not.toContain('?embedded=')
  })

  it('skips signIn when an existing cloudchat-authorized session matches the token email', async () => {
    verifyEmbeddedTokenMock.mockResolvedValue({ email: 'user@cloudhumans.com' })

    const result = await handleEmbeddedAuthentication({
      session: {
        user: {
          email: 'user@cloudhumans.com',
          cloudChatAuthorization: true,
        },
        expires: '2099-01-01',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    expect(result).toBe(true)
    expect(signInMock).not.toHaveBeenCalled()
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('signs out and signs in when the session email does not match the token', async () => {
    verifyEmbeddedTokenMock.mockResolvedValue({ email: 'new@cloudhumans.com' })
    signOutMock.mockResolvedValue(undefined)
    signInMock.mockResolvedValue({ ok: true })

    const result = await handleEmbeddedAuthentication({
      session: {
        user: {
          email: 'stale@cloudhumans.com',
          cloudChatAuthorization: true,
        },
        expires: '2099-01-01',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    expect(result).toBe(true)
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false })
    expect(signInMock).toHaveBeenCalledTimes(1)
  })

  it('returns false and logs when signIn reports failure', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })

    const result = await handleEmbeddedAuthentication({
      session: null,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    expect(result).toBe(false)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Embedded authentication failed',
      expect.objectContaining({
        result: expect.objectContaining({ ok: false }),
      })
    )
  })

  it('returns false and logs error details when signIn throws', async () => {
    signInMock.mockRejectedValue(new TypeError('URL constructor: undefined'))

    const result = await handleEmbeddedAuthentication({
      session: null,
      token: 'cognito.jwt.value',
      callbackUrl: SHORT_CALLBACK,
    })

    expect(result).toBe(false)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Error during embedded authentication',
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'TypeError',
          message: 'URL constructor: undefined',
        }),
      })
    )
  })
})
