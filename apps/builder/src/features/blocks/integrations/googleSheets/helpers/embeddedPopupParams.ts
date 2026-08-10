// Helpers for forwarding the embedded-auth handshake (`embedded=true` + Cognito
// `jwt`) into the Google Sheets popups.
//
// Each popup we open (connect bootstrap, picker) is a top-level window on eddie.
// The builder's NextAuth session cookie is Partitioned (CHIPS) and keyed to the
// CloudChat-embedded partition, so it is NOT sent to that top-level eddie
// context. Each popup therefore has to authenticate itself, exactly like the
// iframe does, by carrying the same `?embedded=true&jwt=` it was loaded with and
// running `useEmbeddedAuth` to establish a first-party session before hitting any
// authenticated endpoint (callback / getAccessToken).
//
// The jwt is only ever appended for our own eddie popups (and only when the
// builder itself is embedded); standalone never receives it.

export type EmbeddedAuthParams = {
  embedded: boolean
  jwt: string | null
}

export const readEmbeddedAuthParams = (
  searchParams: URLSearchParams | null | undefined
): EmbeddedAuthParams => ({
  embedded: searchParams?.get('embedded') === 'true',
  jwt: searchParams?.get('jwt') ?? null,
})

// Appends `embedded=true&jwt=<token>` to an existing query string when the
// builder is embedded and a jwt is present; otherwise returns the params
// untouched so standalone never leaks a token.
export const appendEmbeddedAuthParams = (
  params: URLSearchParams,
  { embedded, jwt }: EmbeddedAuthParams
): URLSearchParams => {
  if (embedded && jwt) {
    params.set('embedded', 'true')
    params.set('jwt', jwt)
  }
  return params
}
