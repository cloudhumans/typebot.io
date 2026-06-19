import { KeyValue } from '@typebot.io/schemas'

export const maskedValue = '••••••••'

// Single source of truth lives in @typebot.io/schemas so the runtime, builder
// and schema stay in lockstep. Re-exported under the historical name used by
// this module's callers and tests.
export { concatUrlPath as cleanUrlConcat } from '@typebot.io/schemas/features/blocks/integrations/webhook/urlHelpers'

/**
 * Merges credential-level (global) key/value entries with block-level (local)
 * ones. A local entry fully overrides the global entry sharing its key —
 * including clearing it: a local entry with an empty value drops the inherited
 * one entirely (the downstream object reducer discards empty values), so the
 * "local overrides global" contract holds even for removal. Remaining global
 * entries come first so locals win for any key still present in both.
 *
 * `caseInsensitiveKeys` controls how a global/local key collision is detected:
 * pass `true` for HTTP headers (`Authorization` and `authorization` are the same
 * name, so a local entry must override either casing — otherwise both reach the
 * client and the override silently breaks), and leave it `false` for query
 * params, whose keys are case-sensitive per RFC 3986 (`?Token=` ≠ `?token=`).
 */
export const mergeKeyValues = (
  global: { key: string; value: string }[] | undefined,
  local: KeyValue[] | undefined,
  { caseInsensitiveKeys = false }: { caseInsensitiveKeys?: boolean } = {}
): KeyValue[] => {
  const normalize = (key: string | undefined) =>
    caseInsensitiveKeys ? key?.toLowerCase() : key
  const localKeys = new Set((local ?? []).map((entry) => normalize(entry.key)))
  const globalAsKeyValues: KeyValue[] = (global ?? [])
    .filter((entry) => !localKeys.has(normalize(entry.key)))
    // Index the id, not just the key: credential entries aren't guaranteed unique
    // keys, and a duplicated `cred-${key}` would collide as a React list key in
    // the builder's TableList (broken render/edit).
    .map((entry, index) => ({
      id: `cred-${index}-${entry.key}`,
      key: entry.key,
      value: entry.value,
    }))
  return [...globalAsKeyValues, ...(local ?? [])]
}

// Upper bound on the characters maskSecretsDeep scans in one call. Beyond it,
// remaining strings are replaced with `tooLargeToMask` instead of scanned,
// capping the O(size × secrets) cost on pathologically large response bodies.
// This is fail-safe: an over-budget value is dropped, never emitted unmasked —
// and only the persisted log is affected (the response returned to the flow is
// never passed through the masker).
export const MAX_MASK_SCAN_CHARS = 256_000
export const tooLargeToMask = '[omitted: payload too large to mask]'

/**
 * Recursively replaces every occurrence of a secret value with a mask in any
 * string found within the given value (objects/arrays are walked deeply).
 * Used to keep credential secrets out of persisted ChatLog details.
 */
export const maskSecretsDeep = <T>(value: T, secretValues: Set<string>): T => {
  if (secretValues.size === 0) return value
  return maskWithinBudget(value, secretValues, { remaining: MAX_MASK_SCAN_CHARS })
}

const maskWithinBudget = <T>(
  value: T,
  secretValues: Set<string>,
  budget: { remaining: number }
): T => {
  if (typeof value === 'string') {
    // Omit (without scanning) any string that alone would exceed the remaining
    // budget. This is what actually bounds the O(size × secrets) work: scanning a
    // huge string first and only then noticing the budget is blown would defeat
    // the cap. Fail-safe — an omitted value is never emitted unmasked. The budget
    // is left untouched so smaller sibling fields can still be masked.
    if (value.length > budget.remaining) return tooLargeToMask as unknown as T
    budget.remaining -= value.length
    let masked: string = value
    for (const secret of secretValues) {
      if (!secret) continue
      // includes() skips the split/join allocation when the secret is absent.
      if (masked.includes(secret))
        masked = masked.split(secret).join(maskedValue)
    }
    return masked as unknown as T
  }
  if (Array.isArray(value))
    return value.map((item) =>
      maskWithinBudget(item, secretValues, budget)
    ) as unknown as T
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, maskWithinBudget(v, secretValues, budget)]
    )
    return Object.fromEntries(entries) as T
  }
  return value
}

// Credential secret values shorter than this are skipped for log masking: a
// 1–4 char value like "1" or "true" would match incidental substrings across
// the whole log (e.g. "INV-1042" -> "INV-••••••••042"), corrupting it. Real API
// tokens are comfortably longer than this floor.
export const MIN_MASKABLE_SECRET_LENGTH = 5

// Strict RFC 3986 percent-encoding, matching what `qs.stringify` emits for query
// params (it escapes !*'() which encodeURIComponent leaves intact). A secret
// like "sk!" becomes "sk%21" in the request URL, so the mask set must cover it.
export const rfc3986Encode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )

// Adds a resolved secret and the encoded forms it may take in a request URL to
// the mask set, skipping values too short to mask without corrupting logs.
// `allowShort` bypasses the length floor for values that are known-secret by
// origin (e.g. credential basic-auth user/pass split out of the header): there
// the leak risk of an echoed short value outweighs the log-noise of masking it.
export const addMaskableSecret = (
  secretValues: Set<string>,
  value: string | undefined,
  { allowShort = false }: { allowShort?: boolean } = {}
): void => {
  if (!value) return
  if (!allowShort && value.length < MIN_MASKABLE_SECRET_LENGTH) return
  secretValues.add(value)
  for (const encoded of [encodeURIComponent(value), rfc3986Encode(value)])
    if (encoded !== value) secretValues.add(encoded)
}

// Header/query-param keys whose *values* should be treated as secrets for log
// masking. Credential values are always masked; this only governs block-level
// overrides, so non-secret values like `Accept: application/json` aren't bulleted
// out of ChatLog details. Matches the usual auth-bearing names as a substring.
const sensitiveKeyPattern =
  /authorization|cookie|api[-_]?key|token|secret|password/i

export const isSensitiveHeaderKey = (key: string | undefined): boolean =>
  !!key && sensitiveKeyPattern.test(key)

const metadataHosts = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  // IPv6 forms of the cloud metadata endpoint (IPv4-mapped + AWS native IPv6).
  '::ffff:169.254.169.254',
  '::ffff:a9fe:a9fe',
  'fd00:ec2::254',
])

// Normalizes a URL hostname for metadata-host comparison: strips IPv6 brackets
// and lowercases, so `[::ffff:169.254.169.254]` and `[FD00:EC2::254]` match.
const normalizeHostname = (hostname: string) =>
  hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')

// Parses a hostname written as an IPv4 address in any common encoding (dotted
// decimal, a single decimal integer, or hex) into a 32-bit int. Returns null
// when the host is not such a form (e.g. a real hostname). Used to block the
// link-local range regardless of how the IP is written (e.g. http://2852039166).
const hostnameToIpv4Int = (host: string): number | null => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number)
    if (parts.some((p) => p > 255)) return null
    return (
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    )
  }
  if (/^\d+$/.test(host)) {
    const n = Number(host)
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16)
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null
  }
  return null
}

// 169.254.0.0/16 (link-local, includes the cloud metadata IP 169.254.169.254).
const isLinkLocalIpv4 = (ipInt: number) => ipInt >>> 16 === 0xa9fe

// Returns the leading 16-bit hextet of an IPv6 hostname (bracket-stripped,
// lowercased), or null when the host is not IPv6. Only the first group is
// needed to classify the link-local / unique-local ranges below.
const ipv6LeadingHextet = (host: string): number | null => {
  if (!host.includes(':')) return null
  // A leading "::" means the address starts at the zero-run (e.g. ::1, ::ffff:…).
  if (host.startsWith('::')) return 0
  const first = host.split(':')[0]
  if (!/^[0-9a-f]{1,4}$/.test(first)) return null
  return parseInt(first, 16)
}

// Blocks the IPv6 ranges that matter for metadata SSRF, mirroring how the IPv4
// guard blocks the whole 169.254.0.0/16 rather than a single address:
//   fe80::/10 — link-local (top 10 bits == 1111111010)
//   fc00::/7  — unique-local, incl. the AWS IMDS host fd00:ec2::254 and siblings
// (top 7 bits == 1111110)
const isBlockedIpv6 = (host: string): boolean => {
  const hextet = ipv6LeadingHextet(host)
  if (hextet === null) return false
  if ((hextet & 0xffc0) === 0xfe80) return true
  if ((hextet & 0xfe00) === 0xfc00) return true
  return false
}

/**
 * Confirms a *resolved* (post-interpolation) URL still sits within the
 * credential's locked base URL: same origin, no injected userinfo, and a path
 * that is the base path or a descendant of it (segment-boundary aware, so `/v1`
 * does not match `/v1evil`). This is the backstop for variable-valued path
 * suffixes: `concatUrlPath` strips `..` from the *template*, but a `{{var}}` that
 * resolves to `../admin` only escapes once `new URL()` normalizes the final URL —
 * which is exactly what this check sees.
 */
export const isWithinBaseUrl = (baseUrl: string, resolvedUrl: string): boolean => {
  let base: URL
  let resolved: URL
  try {
    base = new URL(baseUrl)
    resolved = new URL(resolvedUrl)
  } catch {
    return false
  }
  if (resolved.origin !== base.origin) return false
  // A suffix can't legitimately introduce userinfo; reject the `…@host` shape.
  if (resolved.username !== '' || resolved.password !== '') return false

  // `new URL()` keeps `%2e`/`%2f` percent-encoded in the pathname and does NOT
  // treat them as dot-segments, but many upstream servers decode the path before
  // routing. A variable-valued suffix resolving to `%2e%2e/admin` would otherwise
  // keep a pathname under the base here yet route to `/admin` there. Decode the
  // way a permissive server might (collapse `%25`, then `%2e`/`%2f`), bounded
  // against a decode-bomb, then let `new URL()` resolve `.`/`..` so the prefix
  // check sees the path the server will actually serve.
  // `%5c` (backslash) is included because WHATWG `new URL()` treats a literal `\`
  // as `/` for http(s) — so its *encoded* form is an equivalent separator that a
  // server can decode into a traversal.
  let decodedPath = resolved.pathname
  for (let i = 0; i < 3 && /%(25|2e|2f|5c)/i.test(decodedPath); i++)
    decodedPath = decodedPath
      .replace(/%25/gi, '%')
      .replace(/%2e/gi, '.')
      .replace(/%2f/gi, '/')
      .replace(/%5c/gi, '/')
  let canonical: URL
  try {
    // Resolve against the full base so a decoded protocol-relative `//host`
    // escape changes origin and gets rejected below rather than silently passing.
    canonical = new URL(decodedPath, base)
  } catch {
    return false
  }
  if (canonical.origin !== base.origin) return false
  const basePath = base.pathname.endsWith('/')
    ? base.pathname.slice(0, -1)
    : base.pathname
  return (
    canonical.pathname === basePath ||
    canonical.pathname.startsWith(`${basePath}/`)
  )
}

/**
 * Conservative SSRF guard for the *resolved* request URL (after variable
 * interpolation). Enforces an http/https scheme allowlist and blocks the cloud
 * metadata endpoint (IPv4 and IPv6 forms, including the link-local/unique-local
 * ranges). Broader private-range blocking is intentionally left out to preserve
 * self-hosted setups where webhooks call internal hostnames. When `baseUrl` is
 * given (credential-backed requests), the resolved URL must additionally stay
 * within that locked base URL.
 */
export const isResolvedUrlSafe = (
  url: string,
  opts?: { baseUrl?: string }
): { safe: true } | { safe: false; reason: string } => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { safe: false, reason: 'Invalid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return { safe: false, reason: `Disallowed scheme: ${parsed.protocol}` }
  const host = normalizeHostname(parsed.hostname)
  if (metadataHosts.has(host))
    return { safe: false, reason: 'Blocked metadata host' }
  const ipInt = hostnameToIpv4Int(host)
  if (ipInt !== null && isLinkLocalIpv4(ipInt))
    return { safe: false, reason: 'Blocked link-local/metadata address' }
  if (isBlockedIpv6(host))
    return { safe: false, reason: 'Blocked link-local/metadata address' }
  if (opts?.baseUrl && !isWithinBaseUrl(opts.baseUrl, url))
    return { safe: false, reason: 'URL escapes the credential base path' }
  return { safe: true }
}

