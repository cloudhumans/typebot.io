// Shared URL helpers for REST API credentials, kept in one place so the runtime
// (bot-engine), the builder UI and the credential schema validate and compose
// URLs identically. They previously existed as four near-duplicate copies that
// had to be kept "in lockstep" by hand.

/**
 * The base URL is shown in clear text in the builder and is not value-masked in
 * logs, so it must not itself carry secrets: enforce an http(s) scheme and
 * reject userinfo (e.g. https://user:pass@host) and query/fragment (which could
 * carry secrets like ?token=). Returns false for non-URLs.
 */
export const isSafeBaseUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url.trim())
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    )
  } catch {
    return false
  }
}

/**
 * Concatenates a credential base URL with a block-level path suffix, normalizing
 * slashes. A trailing slash on the base is stripped even when the suffix is empty
 * so the builder's node preview matches the URL the runtime actually requests
 * (e.g. https://api.com/v1, not https://api.com/v1/).
 *
 * The suffix is treated as a path only and is hardened: a query/fragment is
 * dropped (those have a dedicated query-params field and must not ride in the
 * path), and `.` / `..` segments are removed. Encoded forms are neutralized too —
 * `%2e` (`.`) is normalized before the dot check, and `%2f` (`/`) is treated as a
 * separator so a suffix like `%2F..%2Fadmin` is split rather than smuggled
 * through as one segment (some servers decode `%2F` to `/` before routing).
 * Otherwise a block author (who may be less privileged than the admin who owns
 * the credential) could set a suffix like `../admin` that normalizes outside the
 * admin-locked base path, sending the credential's secret headers to an
 * unintended endpoint on the same host.
 */
export const concatUrlPath = (base: string, suffix?: string): string => {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  if (!suffix) return cleanBase
  let pathOnly = suffix.split(/[?#]/)[0]
  // Collapse double/triple percent-encoding (`%252e`, `%25252f`, …) first: a
  // proxy/server that decodes more than once would otherwise turn these back into
  // dot-segments/separators *after* our filter ran. Bounded to a few passes so a
  // crafted `%25%25…` chain can't loop.
  for (let i = 0; i < 3 && /%25/i.test(pathOnly); i++)
    pathOnly = pathOnly.replace(/%25/gi, '%')
  const safePath = pathOnly
    // Treat encoded slashes and back-slashes (literal + encoded) as real
    // separators so they can't hide a `..` segment — http(s) servers and the
    // WHATWG URL parser fold `\` into `/`.
    .replace(/%2f/gi, '/')
    .replace(/%5c/gi, '/')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => {
      if (segment === '') return false
      const normalized = segment.replace(/%2e/gi, '.')
      return normalized !== '.' && normalized !== '..'
    })
    .join('/')
  if (!safePath) return cleanBase
  return `${cleanBase}/${safePath}`
}
