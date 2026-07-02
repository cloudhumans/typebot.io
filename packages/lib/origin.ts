/**
 * Helper function to check if an origin matches a pattern (supporting wildcards)
 * @param origin - The origin to check (e.g., "https://myapp.app.cloudhumans.com")
 * @param pattern - The pattern to match against (e.g., "https://*.app.cloudhumans.com")
 * @returns true if the origin matches the pattern
 */
export const matchesOriginPattern = (
  origin: string,
  pattern: string
): boolean => {
  // Handle wildcard patterns like "https://*.app.cloudhumans.com"
  if (pattern.includes('://*.')) {
    try {
      // Extract the domain from the pattern: "https://*.app.cloudhumans.com" -> "app.cloudhumans.com"
      const patternUrl = new URL(pattern.replace('*.', 'dummy.'))
      const domain = patternUrl.hostname.replace('dummy.', '')

      // Extract hostname from origin
      const originUrl = new URL(origin)
      const hostname = originUrl.hostname

      // Check exact match first
      if (hostname === domain) return true

      // For wildcard, ensure it's a direct subdomain (only one additional level)
      if (hostname.endsWith('.' + domain)) {
        const prefix = hostname.replace('.' + domain, '')
        // Ensure the prefix doesn't contain dots (prevents subdomain injection)
        return !prefix.includes('.')
      }

      return false
    } catch {
      return false
    }
  }

  // Handle simple wildcard patterns like "*.app.cloudhumans.com" (no protocol)
  if (pattern.startsWith('*.')) {
    const domain = pattern.substring(2)
    try {
      const originUrl = new URL(origin)
      const hostname = originUrl.hostname

      // Check exact match first
      if (hostname === domain) return true

      // For wildcard, ensure it's a direct subdomain (only one additional level)
      if (hostname.endsWith('.' + domain)) {
        const prefix = hostname.replace('.' + domain, '')
        // Ensure the prefix doesn't contain dots (prevents subdomain injection)
        return !prefix.includes('.')
      }

      return false
    } catch {
      return false
    }
  }

  // Exact match for full URLs or simple patterns
  return origin === pattern
}

/**
 * Helper function to check if an origin is allowed against a list of patterns
 * @param origin - The origin to check
 * @param allowedPatterns - Array of allowed origin patterns (may include wildcards)
 * @returns true if the origin matches any of the allowed patterns
 */
export const isOriginAllowed = (
  origin: string,
  allowedPatterns: string[]
): boolean => {
  return allowedPatterns.some((pattern) =>
    matchesOriginPattern(origin, pattern)
  )
}

/**
 * Resolve the concrete origin(s) to postMessage a request to an embedding
 * parent frame. The parent origin can't be read cross-origin, and
 * document.referrer is unreliable when the embedded app performs its own
 * sign-in redirects (it can end up pointing at the app's own — allow-listed —
 * origin). So we target every concrete allow-listed origin except our own: the
 * browser only delivers to the one matching the real parent and drops the rest
 * (safe — all targets are trusted and the receiver re-checks event.origin).
 * Wildcard allow-list entries aren't valid postMessage targets, so they're
 * resolved to a concrete origin via ancestorOrigins / referrer when those match
 * the allow-list. Pure, so it can be unit-tested without a DOM.
 */
export const resolveEmbeddingTargetOrigins = ({
  allowedOrigins,
  selfOrigin,
  ancestorOrigins = [],
  referrer,
}: {
  allowedOrigins: string[]
  selfOrigin: string
  ancestorOrigins?: string[]
  referrer?: string
}): string[] => {
  const targets = new Set<string>()
  for (const origin of allowedOrigins) {
    if (origin && !origin.includes('*') && origin !== selfOrigin) {
      targets.add(origin)
    }
  }
  const hints = [...ancestorOrigins]
  if (referrer) {
    try {
      hints.push(new URL(referrer).origin)
    } catch {
      // Ignore a malformed referrer.
    }
  }
  for (const origin of hints) {
    if (
      origin &&
      origin !== selfOrigin &&
      isOriginAllowed(origin, allowedOrigins)
    ) {
      targets.add(origin)
    }
  }
  return [...targets]
}
