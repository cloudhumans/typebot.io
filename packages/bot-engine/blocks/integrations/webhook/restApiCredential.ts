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
  if (metadataHosts.has(normalizeHostname(parsed.hostname)))
    return { safe: false, reason: 'Blocked metadata host' }
  return { safe: true }
}

