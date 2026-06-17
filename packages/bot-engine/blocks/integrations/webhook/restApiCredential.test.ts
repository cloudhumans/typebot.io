import { describe, it, expect } from 'vitest'
import {
  cleanUrlConcat,
  mergeKeyValues,
  maskSecretsDeep,
  isResolvedUrlSafe,
  maskedValue,
} from './restApiCredential'

describe('cleanUrlConcat', () => {
  it('joins base and suffix with a single slash', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', 'orders')).toBe(
      'https://api.example.com/v1/orders'
    )
  })

  it('does not double slashes', () => {
    expect(cleanUrlConcat('https://api.example.com/', '/orders')).toBe(
      'https://api.example.com/orders'
    )
    expect(cleanUrlConcat('https://api.example.com', '/orders')).toBe(
      'https://api.example.com/orders'
    )
  })

  it('returns the base unchanged when suffix is empty (no trailing slash)', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', '')).toBe(
      'https://api.example.com/v1'
    )
    expect(cleanUrlConcat('https://api.example.com/v1/', '')).toBe(
      'https://api.example.com/v1'
    )
  })
})

describe('mergeKeyValues', () => {
  it('places global entries before local ones (local wins downstream on dup keys)', () => {
    const merged = mergeKeyValues(
      [{ key: 'Authorization', value: 'global' }],
      [{ id: 'l1', key: 'Authorization', value: 'local' }]
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ key: 'Authorization', value: 'global' })
    expect(merged[1]).toMatchObject({ key: 'Authorization', value: 'local' })
  })

  it('handles undefined global/local', () => {
    expect(mergeKeyValues(undefined, undefined)).toEqual([])
    expect(mergeKeyValues([{ key: 'X', value: '1' }], undefined)).toHaveLength(1)
  })
})

describe('maskSecretsDeep', () => {
  it('masks secret substrings in nested objects/arrays', () => {
    const secrets = new Set(['Bearer sk_live_123', 'queryToken'])
    const input = {
      url: 'https://api.example.com?token=queryToken',
      headers: {
        Authorization: 'Bearer sk_live_123',
        Accept: 'application/json',
      },
      list: ['nothing', 'Bearer sk_live_123'],
    }
    const masked = maskSecretsDeep(input, secrets)
    expect(masked.headers.Authorization).toBe(maskedValue)
    expect(masked.headers.Accept).toBe('application/json')
    expect(masked.url).toBe(`https://api.example.com?token=${maskedValue}`)
    expect(masked.list[1]).toBe(maskedValue)
  })

  it('masks the URL-encoded form of a secret too (query params get percent-encoded)', () => {
    const raw = 'a b/c'
    const secrets = new Set([raw, encodeURIComponent(raw)])
    const masked = maskSecretsDeep(
      { url: `https://x.com?k=${encodeURIComponent(raw)}` },
      secrets
    )
    expect(masked.url).toBe(`https://x.com?k=${maskedValue}`)
  })

  it('is a no-op when there are no secrets', () => {
    expect(maskSecretsDeep({ a: 'b' }, new Set())).toEqual({ a: 'b' })
  })
})

describe('isResolvedUrlSafe', () => {
  it('allows http/https hosts (including internal hostnames)', () => {
    expect(isResolvedUrlSafe('https://api.stripe.com/v1').safe).toBe(true)
    expect(isResolvedUrlSafe('http://backoffice-mock:8001/api').safe).toBe(true)
  })

  it('rejects non-http(s) schemes', () => {
    expect(isResolvedUrlSafe('file:///etc/passwd').safe).toBe(false)
    expect(isResolvedUrlSafe('ftp://example.com').safe).toBe(false)
  })

  it('rejects the cloud metadata endpoint (IPv4 and IPv6 forms)', () => {
    expect(
      isResolvedUrlSafe('http://169.254.169.254/latest/meta-data').safe
    ).toBe(false)
    expect(isResolvedUrlSafe('http://metadata.google.internal/').safe).toBe(
      false
    )
    expect(
      isResolvedUrlSafe('http://[::ffff:169.254.169.254]/latest/meta-data').safe
    ).toBe(false)
    expect(isResolvedUrlSafe('http://[fd00:ec2::254]/latest/meta-data').safe).toBe(
      false
    )
  })

  it('rejects malformed URLs', () => {
    expect(isResolvedUrlSafe('not a url').safe).toBe(false)
  })
})
