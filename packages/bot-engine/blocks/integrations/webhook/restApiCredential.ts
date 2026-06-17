import { KeyValue, RestApiCredentials } from '@typebot.io/schemas'
import prisma from '@typebot.io/lib/prisma'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'

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
])

/**
 * Conservative SSRF guard for the *resolved* request URL (after variable
 * interpolation). Enforces an http/https scheme allowlist and blocks the cloud
 * metadata endpoint. Broader private-range blocking is intentionally left out
 * to preserve self-hosted setups where webhooks call internal hostnames.
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
  if (metadataHosts.has(parsed.hostname.toLowerCase()))
    return { safe: false, reason: 'Blocked metadata host' }
  return { safe: true }
}

/**
 * Fetches and decrypts a rest-api credential, scoped to the executing
 * workspace. Returns null when no matching credential exists (wrong workspace,
 * deleted, wrong type) — callers must abort the block in that case.
 */
export const resolveRestApiCredentialData = async ({
  credentialsId,
  workspaceId,
}: {
  credentialsId: string
  workspaceId: string | undefined
}): Promise<RestApiCredentials['data'] | null> => {
  if (!workspaceId) return null
  const credential = await prisma.credentials.findFirst({
    where: { id: credentialsId, workspaceId, type: 'rest-api' },
  })
  if (!credential) return null
  try {
    return (await decrypt(
      credential.data,
      credential.iv
    )) as RestApiCredentials['data']
  } catch {
    // Corrupted payload / missing ENCRYPTION_SECRET — fail closed so the caller
    // aborts the block in a controlled way rather than throwing.
    return null
  }
}
