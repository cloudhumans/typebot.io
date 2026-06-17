import { KeyValue } from '@typebot.io/schemas'

export const maskedValue = '••••••••'

/**
 * Safely concatenates a credential base URL with a block-level path suffix,
 * normalizing slashes. An empty suffix returns the base URL unchanged.
 */
export const cleanUrlConcat = (base: string, suffix: string): string => {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  if (!suffix) return cleanBase
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${cleanBase}${cleanSuffix}`
}

/**
 * Merges credential-level (global) key/value entries with block-level (local)
 * ones. Local entries override global ones when they share the same key.
 * Global entries come first so the downstream object reducer lets locals win.
 */
export const mergeKeyValues = (
  global: { key: string; value: string }[] | undefined,
  local: KeyValue[] | undefined
): KeyValue[] => {
  const globalAsKeyValues: KeyValue[] = (global ?? []).map((entry) => ({
    id: `cred-${entry.key}`,
    key: entry.key,
    value: entry.value,
  }))
  return [...globalAsKeyValues, ...(local ?? [])]
}

/**
 * Recursively replaces every occurrence of a secret value with a mask in any
 * string found within the given value (objects/arrays are walked deeply).
 * Used to keep credential secrets out of persisted ChatLog details.
 */
export const maskSecretsDeep = <T>(value: T, secretValues: Set<string>): T => {
  if (secretValues.size === 0) return value
  if (typeof value === 'string') {
    let masked: string = value
    for (const secret of secretValues) {
      if (!secret) continue
      masked = masked.split(secret).join(maskedValue)
    }
    return masked as unknown as T
  }
  if (Array.isArray(value))
    return value.map((item) => maskSecretsDeep(item, secretValues)) as unknown as T
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, maskSecretsDeep(v, secretValues)]
    )
    return Object.fromEntries(entries) as T
  }
  return value
}

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

/**
 * Conservative SSRF guard for the *resolved* request URL (after variable
 * interpolation). Enforces an http/https scheme allowlist and blocks the cloud
 * metadata endpoint (IPv4 and IPv6 forms). Broader private-range blocking is
 * intentionally left out to preserve self-hosted setups where webhooks call
 * internal hostnames.
 */
export const isResolvedUrlSafe = (
  url: string
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
  return { safe: true }
}

