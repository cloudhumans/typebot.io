import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { Center, Spinner } from '@chakra-ui/react'
import { getGoogleSheetsConsentScreenUrlQuery } from '@/features/blocks/integrations/googleSheets/queries/getGoogleSheetsConsentScreenUrlQuery'

// Bootstrap page for the Google Sheets OAuth connect, opened as a top-level
// popup in embedded mode. The popup does NOT inherit the builder's Partitioned
// NextAuth session, so it has to authenticate itself with the Cognito jwt
// before bouncing to Google's consent. That handshake is handled upstream by
// EmbeddedAuthWrapper (in _app.tsx, via useEmbeddedAuth, reading embedded=true&
// jwt from the URL) — this page's body only renders once the wrapper has
// established a first-party session. We then bounce to Google's consent so its
// callback hits /api/.../callback with a valid session.
//
// This page is only used in embedded mode; standalone opens the consent URL
// directly (it already has a first-party session).
const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default function Page() {
  const router = useRouter()
  const hasRunRef = useRef(false)

  useEffect(() => {
    // router.query has an unstable identity; guard so we replace() exactly once.
    if (!router.isReady || hasRunRef.current) return
    hasRunRef.current = true
    const redirectUrl = firstQueryValue(router.query.redirectUrl)
    const blockId = firstQueryValue(router.query.blockId)
    const workspaceId = firstQueryValue(router.query.workspaceId)
    const typebotId = firstQueryValue(router.query.typebotId)
    // Fail early if any param the callback needs is missing: workspaceId (else
    // the callback 400s) and typebotId (else it can't update the block → 404),
    // plus redirectUrl/blockId. Closing here avoids making the user complete
    // Google's consent only to hit an error on the callback.
    if (!redirectUrl || !blockId || !workspaceId || !typebotId) {
      globalThis.close()
      return
    }

    const consentUrl = getGoogleSheetsConsentScreenUrlQuery(
      redirectUrl,
      blockId,
      workspaceId,
      typebotId
    )
    globalThis.location.replace(consentUrl)
  }, [router.isReady, router.query])

  return (
    <Center h="100vh">
      <Spinner />
    </Center>
  )
}
