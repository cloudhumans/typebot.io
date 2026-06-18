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
 */
export const concatUrlPath = (base: string, suffix?: string): string => {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  if (!suffix) return cleanBase
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${cleanBase}${cleanSuffix}`
}
