import { describe, expect, it } from 'vitest'
import {
  appendEmbeddedAuthParams,
  readEmbeddedAuthParams,
} from './embeddedPopupParams'

describe('readEmbeddedAuthParams', () => {
  it('reads embedded + jwt when present', () => {
    const params = new URLSearchParams('embedded=true&jwt=abc')
    expect(readEmbeddedAuthParams(params)).toEqual({
      embedded: true,
      jwt: 'abc',
    })
  })

  it('treats embedded other than "true" as not embedded', () => {
    const params = new URLSearchParams('embedded=1&jwt=abc')
    expect(readEmbeddedAuthParams(params)).toEqual({
      embedded: false,
      jwt: 'abc',
    })
  })

  it('returns defaults for empty params', () => {
    expect(readEmbeddedAuthParams(new URLSearchParams())).toEqual({
      embedded: false,
      jwt: null,
    })
  })

  it('handles null/undefined searchParams', () => {
    expect(readEmbeddedAuthParams(null)).toEqual({ embedded: false, jwt: null })
    expect(readEmbeddedAuthParams(undefined)).toEqual({
      embedded: false,
      jwt: null,
    })
  })
})

describe('appendEmbeddedAuthParams', () => {
  it('appends embedded + jwt when embedded with a jwt', () => {
    const params = appendEmbeddedAuthParams(
      new URLSearchParams({ workspaceId: 'w1' }),
      { embedded: true, jwt: 'token' }
    )
    expect(params.get('workspaceId')).toBe('w1')
    expect(params.get('embedded')).toBe('true')
    expect(params.get('jwt')).toBe('token')
  })

  it('does not append when not embedded (no token leak in standalone)', () => {
    const params = appendEmbeddedAuthParams(
      new URLSearchParams({ workspaceId: 'w1' }),
      { embedded: false, jwt: 'token' }
    )
    expect(params.get('embedded')).toBeNull()
    expect(params.get('jwt')).toBeNull()
  })

  it('does not append when embedded but jwt is missing', () => {
    const params = appendEmbeddedAuthParams(new URLSearchParams(), {
      embedded: true,
      jwt: null,
    })
    expect(params.get('embedded')).toBeNull()
    expect(params.get('jwt')).toBeNull()
  })
})
