import { describe, it, expect } from 'vitest'
import {
  cleanUrlConcat,
  mergeKeyValues,
  maskSecretsDeep,
  isResolvedUrlSafe,
  maskedValue,
  addMaskableSecret,
  rfc3986Encode,
  isSensitiveHeaderKey,
  MAX_MASK_SCAN_CHARS,
  tooLargeToMask,
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

  it('strips "." / ".." segments so the suffix cannot escape the base path', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', '../admin')).toBe(
      'https://api.example.com/v1/admin'
    )
    expect(cleanUrlConcat('https://api.example.com/v1', '../../admin')).toBe(
      'https://api.example.com/v1/admin'
    )
    expect(cleanUrlConcat('https://api.example.com/v1', './orders')).toBe(
      'https://api.example.com/v1/orders'
    )
    expect(
      cleanUrlConcat('https://api.example.com/v1', 'orders/../../admin')
    ).toBe('https://api.example.com/v1/orders/admin')
  })

  it('also strips percent-encoded "." / ".." segments (%2e)', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', '%2e%2e/admin')).toBe(
      'https://api.example.com/v1/admin'
    )
    expect(cleanUrlConcat('https://api.example.com/v1', '%2E%2E/admin')).toBe(
      'https://api.example.com/v1/admin'
    )
  })

  it('neutralizes encoded-slash traversal (%2f hiding a .. segment)', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', '%2F..%2Fadmin')).toBe(
      'https://api.example.com/v1/admin'
    )
    expect(cleanUrlConcat('https://api.example.com/v1', '..%2Fadmin')).toBe(
      'https://api.example.com/v1/admin'
    )
    expect(
      cleanUrlConcat('https://api.example.com/v1', '%2e%2e%2fadmin')
    ).toBe('https://api.example.com/v1/admin')
  })

  it('drops a query/fragment from the suffix (those belong to dedicated fields)', () => {
    expect(cleanUrlConcat('https://api.example.com/v1', 'orders?token=x')).toBe(
      'https://api.example.com/v1/orders'
    )
    expect(cleanUrlConcat('https://api.example.com/v1', 'orders#frag')).toBe(
      'https://api.example.com/v1/orders'
    )
  })
})

describe('mergeKeyValues', () => {
  it('lets a local entry fully override the global one with the same key', () => {
    const merged = mergeKeyValues(
      [{ key: 'Authorization', value: 'global' }],
      [{ id: 'l1', key: 'Authorization', value: 'local' }]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ key: 'Authorization', value: 'local' })
  })

  it('keeps both when keys differ (global first)', () => {
    const merged = mergeKeyValues(
      [{ key: 'X-Global', value: 'g' }],
      [{ id: 'l1', key: 'X-Local', value: 'l' }]
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ key: 'X-Global', value: 'g' })
    expect(merged[1]).toMatchObject({ key: 'X-Local', value: 'l' })
  })

  it('lets a local empty value clear the inherited global entry', () => {
    // The global entry is dropped, leaving only the (empty) local one, which the
    // downstream object reducer discards — so the header is effectively removed.
    const merged = mergeKeyValues(
      [{ key: 'Authorization', value: 'global-secret' }],
      [{ id: 'l1', key: 'Authorization', value: '' }]
    )
    expect(merged.filter((e) => e.value === 'global-secret')).toHaveLength(0)
    expect(merged).toEqual([
      expect.objectContaining({ key: 'Authorization', value: '' }),
    ])
  })

  it('handles undefined global/local', () => {
    expect(mergeKeyValues(undefined, undefined)).toEqual([])
    expect(mergeKeyValues([{ key: 'X', value: '1' }], undefined)).toHaveLength(1)
  })

  it('treats query-param keys as case-sensitive by default (Token !== token)', () => {
    const merged = mergeKeyValues(
      [{ key: 'Token', value: 'global' }],
      [{ id: 'l1', key: 'token', value: 'local' }]
    )
    // Different keys per RFC 3986 -> both kept.
    expect(merged).toHaveLength(2)
    expect(merged.map((e) => e.value).sort()).toEqual(['global', 'local'])
  })

  it('with caseInsensitiveKeys, a local header overrides a differently-cased global one', () => {
    const merged = mergeKeyValues(
      [{ key: 'Authorization', value: 'cred' }],
      [{ id: 'l1', key: 'authorization', value: 'block' }],
      { caseInsensitiveKeys: true }
    )
    // The credential entry is dropped; only the block's casing/value survives, so
    // the client never receives two conflicting Authorization headers.
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ key: 'authorization', value: 'block' })
  })

  it('with caseInsensitiveKeys, a local empty header clears a differently-cased global one', () => {
    const merged = mergeKeyValues(
      [{ key: 'Authorization', value: 'cred-secret' }],
      [{ id: 'l1', key: 'authorization', value: '' }],
      { caseInsensitiveKeys: true }
    )
    expect(merged.filter((e) => e.value === 'cred-secret')).toHaveLength(0)
    expect(merged).toEqual([
      expect.objectContaining({ key: 'authorization', value: '' }),
    ])
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

  it('omits an oversized field without scanning it, but still masks smaller siblings', () => {
    const secret = 'SUPER-SECRET-TOKEN-VALUE'
    const masked = maskSecretsDeep(
      {
        early: `Authorization: ${secret}`,
        filler: 'x'.repeat(MAX_MASK_SCAN_CHARS + 1), // alone exceeds the budget
        late: `also ${secret} here`,
      },
      new Set([secret])
    )
    // Scanned within budget -> masked normally.
    expect(masked.early).toContain(maskedValue)
    expect(masked.early).not.toContain(secret)
    // Too large to scan -> dropped wholesale (fail-safe, can't leak)...
    expect(masked.filler).toBe(tooLargeToMask)
    // ...but the oversized field doesn't consume the budget, so a smaller sibling
    // after it is still masked rather than collateral-omitted.
    expect(masked.late).toContain(maskedValue)
    expect(masked.late).not.toContain(secret)
  })

  it('never leaks a secret once the cumulative budget is exhausted', () => {
    const secret = 'SUPER-SECRET-TOKEN-VALUE'
    // A first field that consumes the whole budget, then a field holding the
    // secret: the second can't be scanned, so it must be omitted, not leaked.
    const masked = maskSecretsDeep(
      {
        filler: 'x'.repeat(MAX_MASK_SCAN_CHARS),
        secretField: `token=${secret}`,
      },
      new Set([secret])
    )
    expect(masked.secretField).toBe(tooLargeToMask)
    expect(masked.secretField).not.toContain(secret)
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

  it('rejects alternate IP encodings of the metadata/link-local address', () => {
    // 2852039166 === 169.254.169.254
    expect(isResolvedUrlSafe('http://2852039166/latest/meta-data').safe).toBe(
      false
    )
    expect(isResolvedUrlSafe('http://0xA9FEA9FE/').safe).toBe(false)
    expect(isResolvedUrlSafe('http://169.254.0.1/').safe).toBe(false)
  })

  it('rejects IPv6 link-local (fe80::/10) and unique-local (fc00::/7) ranges', () => {
    // Whole ranges, not just specific addresses: the AWS IMDS sibling fd00:ec2::253
    // (not in the fixed metadata set) must be blocked just like ::254.
    expect(isResolvedUrlSafe('http://[fd00:ec2::253]/').safe).toBe(false)
    expect(isResolvedUrlSafe('http://[fc00::1]/').safe).toBe(false)
    expect(isResolvedUrlSafe('http://[fd12:3456:789a::1]/').safe).toBe(false)
    expect(isResolvedUrlSafe('http://[fe80::1]/').safe).toBe(false)
    expect(isResolvedUrlSafe('http://[FE80::abcd]/').safe).toBe(false)
  })

  it('still allows normal public/private IPs and hosts', () => {
    expect(isResolvedUrlSafe('http://10.0.0.5:8080/api').safe).toBe(true)
    expect(isResolvedUrlSafe('https://1.1.1.1/').safe).toBe(true)
    // Public IPv6 (Cloudflare DNS) is outside the blocked ranges.
    expect(isResolvedUrlSafe('https://[2606:4700:4700::1111]/').safe).toBe(true)
  })

  it('rejects malformed URLs', () => {
    expect(isResolvedUrlSafe('not a url').safe).toBe(false)
  })
})

describe('rfc3986Encode', () => {
  it('escapes the sub-delims encodeURIComponent leaves intact (!*\'())', () => {
    expect(rfc3986Encode("sk-secret!*'()")).toBe('sk-secret%21%2A%27%28%29')
  })

  it('matches encodeURIComponent for ordinary characters', () => {
    expect(rfc3986Encode('a b/c')).toBe(encodeURIComponent('a b/c'))
  })
})

describe('addMaskableSecret', () => {
  it('skips values shorter than the minimum length (avoids log corruption)', () => {
    const set = new Set<string>()
    addMaskableSecret(set, '1')
    addMaskableSecret(set, 'true')
    addMaskableSecret(set, '')
    addMaskableSecret(set, undefined)
    expect(set.size).toBe(0)
  })

  it('adds the raw value and its encoded forms for maskable secrets', () => {
    const set = new Set<string>()
    addMaskableSecret(set, "sk-live-secret!")
    expect(set.has("sk-live-secret!")).toBe(true)
    // qs.stringify (RFC 3986) form must be covered so it cannot leak in a URL.
    expect(set.has('sk-live-secret%21')).toBe(true)
  })

  it('covers the encodeURIComponent form for values with spaces/slashes', () => {
    const set = new Set<string>()
    addMaskableSecret(set, 'token with/space')
    expect(set.has('token with/space')).toBe(true)
    expect(set.has(encodeURIComponent('token with/space'))).toBe(true)
  })

  it('with allowShort, masks short values too (e.g. basic-auth fragments)', () => {
    const set = new Set<string>()
    addMaskableSecret(set, 'ab', { allowShort: true })
    expect(set.has('ab')).toBe(true)
    // Still rejects empty/undefined regardless of allowShort.
    addMaskableSecret(set, '', { allowShort: true })
    addMaskableSecret(set, undefined, { allowShort: true })
    expect(set.has('')).toBe(false)
  })
})

describe('isSensitiveHeaderKey', () => {
  it('matches the usual auth-bearing keys (case-insensitive, substring)', () => {
    for (const key of [
      'Authorization',
      'authorization',
      'Cookie',
      'X-Api-Key',
      'x-api-key',
      'apikey',
      'X-Auth-Token',
      'access_token',
      'X-Secret',
      'password',
    ])
      expect(isSensitiveHeaderKey(key)).toBe(true)
  })

  it('does not match ordinary non-secret header keys', () => {
    for (const key of ['Accept', 'Content-Type', 'User-Agent', 'X-Request-Id', ''])
      expect(isSensitiveHeaderKey(key)).toBe(false)
    expect(isSensitiveHeaderKey(undefined)).toBe(false)
  })
})
