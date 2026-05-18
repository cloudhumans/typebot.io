import { describe, it, expect, vi } from 'vitest'
import {
  transformSetCookie,
  patchSetCookieForPartitioned,
} from './cookiePartitioning'

describe('transformSetCookie', () => {
  describe('non-NextAuth cookies', () => {
    it('passes through unrelated cookies untouched', () => {
      const cookie = 'session-id=abc123; Path=/; HttpOnly'
      expect(transformSetCookie(cookie)).toBe(cookie)
    })

    it('does not match when the cookie value contains the NextAuth substring', () => {
      const cookie =
        'other=this-value-contains-next-auth.session-token-inside; Path=/'
      expect(transformSetCookie(cookie)).toBe(cookie)
    })

    it('does not match when a different cookie name shares the suffix', () => {
      const cookie = 'app.next-auth.session-token=xyz; Path=/'
      expect(transformSetCookie(cookie)).toBe(cookie)
    })
  })

  describe('NextAuth cookie matching', () => {
    it('matches the dev (non-secure) session token name', () => {
      const cookie = 'next-auth.session-token=jwt; Path=/; HttpOnly'
      expect(transformSetCookie(cookie)).toBe(`${cookie}; Partitioned`)
    })

    it('matches the production `__Secure-` session token name', () => {
      const cookie =
        '__Secure-next-auth.session-token=jwt; Path=/; HttpOnly; Secure; SameSite=None'
      expect(transformSetCookie(cookie)).toBe(`${cookie}; Partitioned`)
    })

    it('matches the production `__Host-` CSRF cookie name', () => {
      const cookie =
        '__Host-next-auth.csrf-token=token; Path=/; HttpOnly; Secure; SameSite=Lax'
      expect(transformSetCookie(cookie)).toBe(`${cookie}; Partitioned`)
    })

    it('matches the callback-url cookie', () => {
      const cookie =
        '__Secure-next-auth.callback-url=https%3A%2F%2Fhost; Path=/'
      expect(transformSetCookie(cookie)).toBe(`${cookie}; Partitioned`)
    })

    it('matches chunked session-token names (`.0`, `.1`)', () => {
      const chunk0 = '__Secure-next-auth.session-token.0=part-a; Path=/'
      const chunk1 = '__Secure-next-auth.session-token.1=part-b; Path=/'
      expect(transformSetCookie(chunk0)).toBe(`${chunk0}; Partitioned`)
      expect(transformSetCookie(chunk1)).toBe(`${chunk1}; Partitioned`)
    })
  })

  describe('idempotency', () => {
    it('leaves already-partitioned cookies untouched', () => {
      const cookie = 'next-auth.session-token=jwt; Path=/; Partitioned'
      expect(transformSetCookie(cookie)).toBe(cookie)
    })

    it('is case-insensitive when checking for the Partitioned attribute', () => {
      const cookie = 'next-auth.session-token=jwt; Path=/; partitioned'
      expect(transformSetCookie(cookie)).toBe(cookie)
    })
  })

  describe('deletion cookies', () => {
    it('emits both unpartitioned and partitioned variants when Max-Age=0', () => {
      const cookie =
        '__Secure-next-auth.session-token=; Max-Age=0; Path=/; HttpOnly'
      expect(transformSetCookie(cookie)).toEqual([
        cookie,
        `${cookie}; Partitioned`,
      ])
    })

    it('emits both variants when Expires is the epoch sentinel', () => {
      const cookie =
        '__Secure-next-auth.session-token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/'
      expect(transformSetCookie(cookie)).toEqual([
        cookie,
        `${cookie}; Partitioned`,
      ])
    })
  })
})

describe('patchSetCookieForPartitioned', () => {
  const buildResStub = () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const res = {
      setHeader: vi.fn((name: string, value: unknown) => {
        calls.push({ name, value })
      }),
    }
    return { res: res as never, calls }
  }

  it('rewrites a string Set-Cookie value', () => {
    const { res, calls } = buildResStub()
    patchSetCookieForPartitioned(res)
    ;(res as { setHeader: (n: string, v: unknown) => void }).setHeader(
      'Set-Cookie',
      'next-auth.session-token=jwt; Path=/'
    )
    expect(calls[0].name).toBe('Set-Cookie')
    expect(calls[0].value).toEqual([
      'next-auth.session-token=jwt; Path=/; Partitioned',
    ])
  })

  it('rewrites every entry of an array Set-Cookie value', () => {
    const { res, calls } = buildResStub()
    patchSetCookieForPartitioned(res)
    ;(res as { setHeader: (n: string, v: unknown) => void }).setHeader(
      'Set-Cookie',
      ['__Secure-next-auth.session-token=jwt; Path=/', 'other=foo; Path=/']
    )
    expect(calls[0].value).toEqual([
      '__Secure-next-auth.session-token=jwt; Path=/; Partitioned',
      'other=foo; Path=/',
    ])
  })

  it('expands a deletion cookie into a pair of headers', () => {
    const { res, calls } = buildResStub()
    patchSetCookieForPartitioned(res)
    const deletion =
      '__Secure-next-auth.session-token=; Max-Age=0; Path=/; HttpOnly'
    ;(res as { setHeader: (n: string, v: unknown) => void }).setHeader(
      'Set-Cookie',
      deletion
    )
    expect(calls[0].value).toEqual([deletion, `${deletion}; Partitioned`])
  })

  it('passes through non Set-Cookie headers unchanged', () => {
    const { res, calls } = buildResStub()
    patchSetCookieForPartitioned(res)
    ;(res as { setHeader: (n: string, v: unknown) => void }).setHeader(
      'Content-Type',
      'application/json'
    )
    expect(calls[0]).toEqual({
      name: 'Content-Type',
      value: 'application/json',
    })
  })
})
