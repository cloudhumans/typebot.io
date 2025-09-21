/**
 * Helper function to check if an origin matches a pattern (supporting wildcards)
 * @param origin - The origin to check (e.g., "https://myapp.app.cloudhumans.com")
 * @param pattern - The pattern to match against (e.g., "https://*.app.cloudhumans.com")
 * @returns true if the origin matches the pattern
 */
export const matchesOriginPattern = (origin: string, pattern: string): boolean => {
  if (pattern.startsWith('*.')) {
    const domain = pattern.substring(2)
    try {
      const originUrl = new URL(origin)
      return originUrl.hostname.endsWith('.' + domain) || originUrl.hostname === domain
    } catch {
      return false
    }
  }
  return origin === pattern
}

/**
 * Helper function to check if an origin is allowed against a list of patterns
 * @param origin - The origin to check
 * @param allowedPatterns - Array of allowed origin patterns (may include wildcards)
 * @returns true if the origin matches any of the allowed patterns
 */
export const isOriginAllowed = (origin: string, allowedPatterns: string[]): boolean => {
  return allowedPatterns.some(pattern => matchesOriginPattern(origin, pattern))
}