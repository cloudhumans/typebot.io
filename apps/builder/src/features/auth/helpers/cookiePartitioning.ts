import type { NextApiResponse } from 'next'
import type { ServerResponse } from 'http'

// CHIPS (Cookies Having Independent Partitioned State): append the `Partitioned`
// attribute to NextAuth cookies so they survive Chrome's third-party cookie
// phaseout when the builder is embedded inside CloudChat via iframe. Without
// this, the CSRF cookie is dropped in the partitioned context, `getCsrfToken()`
// on the client returns null, and `signIn('cloudchat-embedded', { redirect: false })`
// crashes inside next-auth/react with `new URL(undefined)` → "Failed to construct
// 'URL': Invalid URL".
//
// We patch `Set-Cookie` at the response layer because next-auth 4.22.1 depends
// on `cookie@^0.5.0`, which predates `Partitioned` support (added in
// cookie@0.7.0), so the `cookies` option in AuthOptions cannot emit the
// attribute itself.
//
// Refs:
//   - https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies
//   - https://developers.google.com/privacy-sandbox/cookies/chips
//   - https://datatracker.ietf.org/doc/draft-cutler-httpbis-partitioned-cookies/

// Anchored matcher applied to the cookie *name* only (the substring before the
// first `=`). Accepts the `__Secure-` / `__Host-` prefixes NextAuth uses in
// production, and the `.0`, `.1`, ... chunk suffixes it appends when a JWT
// session cookie exceeds the 4KB per-cookie limit.
const NEXT_AUTH_COOKIE_NAME_RE =
  /^(?:__Secure-|__Host-)?next-auth\.(?:session-token|callback-url|csrf-token)(?:\.\d+)?$/

const extractCookieName = (cookie: string): string => {
  const eqIdx = cookie.indexOf('=')
  if (eqIdx === -1) return ''
  return cookie.slice(0, eqIdx).trim()
}

const isNextAuthCookie = (cookie: string): boolean =>
  NEXT_AUTH_COOKIE_NAME_RE.test(extractCookieName(cookie))

const hasPartitionedAttribute = (cookie: string): boolean =>
  /;\s*Partitioned/i.test(cookie)

// NextAuth signs out by emitting a `Set-Cookie` with `Max-Age=0` (and an
// `Expires` in the past). Partitioned and unpartitioned cookies live in
// separate browser storage buckets, so a deletion header that carries
// `Partitioned` only clears the partitioned bucket; any legacy unpartitioned
// cookie issued before this feature shipped would persist. To migrate cleanly
// we emit both variants on deletion so both buckets are cleared.
const isDeletionCookie = (cookie: string): boolean =>
  /;\s*Max-Age=0\b/i.test(cookie) ||
  /;\s*Expires=Thu,\s*01\s+Jan\s+1970/i.test(cookie)

const withPartitioned = (cookie: string): string => `${cookie}; Partitioned`

export const transformSetCookie = (cookie: string): string | string[] => {
  if (!isNextAuthCookie(cookie)) return cookie
  if (hasPartitionedAttribute(cookie)) return cookie
  if (isDeletionCookie(cookie)) return [cookie, withPartitioned(cookie)]
  return withPartitioned(cookie)
}

export const patchSetCookieForPartitioned = (
  res: NextApiResponse | ServerResponse
) => {
  const origSetHeader = res.setHeader.bind(res)
  res.setHeader = ((
    name: string,
    value: number | string | readonly string[]
  ) => {
    if (name.toLowerCase() === 'set-cookie' && value !== undefined) {
      const cookies = Array.isArray(value) ? value : [String(value)]
      const patched = cookies.flatMap((c) => {
        const result = transformSetCookie(c)
        return Array.isArray(result) ? result : [result]
      })
      return origSetHeader(name, patched)
    }
    return origSetHeader(name, value as never)
  }) as typeof res.setHeader
}
