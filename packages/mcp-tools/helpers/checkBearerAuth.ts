import { createHash, timingSafeEqual } from 'crypto'

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
 * buffers differ in length, which would force a length branch that leaks the
 * provided token's length via timing. We sidestep that by hashing both inputs
 * with SHA-256 first: the digests are always 32 bytes, so `timingSafeEqual`
 * always gets equal-length buffers and there is no length-dependent branch.
 * This is the comparison pattern the Node.js `crypto.timingSafeEqual` docs
 * recommend for inputs of differing length.
 */
const timingSafeStringEqual = (a: string, b: string): boolean => {
  const digestA = createHash('sha256').update(a).digest()
  const digestB = createHash('sha256').update(b).digest()
  return timingSafeEqual(digestA, digestB)
}
