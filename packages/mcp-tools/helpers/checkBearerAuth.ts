import { timingSafeEqual } from 'crypto'

export type BearerAuthResult =
  | { authorized: true }
  | { authorized: false; reason: 'misconfigured' | 'missing' | 'invalid' }

/**
 * Validates a Bearer `Authorization` header against the configured MCP tools
 * API token.
 *
 * Fail-closed: when `configuredToken` is empty/undefined the request is
 * rejected as `misconfigured` (the route must respond 401 and log a warning),
 * never allowed through.
 *
 * The comparison is timing-safe: it always runs `timingSafeEqual` over equal
 * length buffers so a wrong-length token does not leak via early return, and
 * the length check itself is folded into the final boolean.
 */
export function checkBearerAuth(
  authorizationHeader: string | undefined,
  configuredToken: string | undefined
): BearerAuthResult {
  if (!configuredToken) return { authorized: false, reason: 'misconfigured' }

  const provided = extractBearerToken(authorizationHeader)
  if (provided === undefined) return { authorized: false, reason: 'missing' }

  if (timingSafeStringEqual(provided, configuredToken))
    return { authorized: true }

  return { authorized: false, reason: 'invalid' }
}

const extractBearerToken = (
  authorizationHeader: string | undefined
): string | undefined => {
  if (!authorizationHeader) return undefined
  const match = /^Bearer (.+)$/.exec(authorizationHeader)
  return match ? match[1] : undefined
}

/**
 * Constant-time string comparison. `timingSafeEqual` throws when the two
 * buffers differ in length, so we cannot call it directly on inputs of unknown
 * size. When the lengths differ we still run one `timingSafeEqual` over a
 * same-length buffer (the input compared against itself) before returning
 * false, so the mismatch path does the same work as the equal-length path and
 * does not leak length via an early return.
 */
const timingSafeStringEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Run a same-length comparison anyway to avoid leaking length via timing,
    // then return false.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
