import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Center, Spinner } from '@chakra-ui/react'
import {
  GOOGLE_SHEETS_CONNECTED_MESSAGE,
  type GoogleSheetsConnectedMessage,
} from '@/features/blocks/integrations/googleSheets/helpers/popupMessaging'

// Terminal page of the Google Sheets OAuth flow. The callback API route has
// already created the Credentials and persisted credentialsId on the block, so
// this page only has to deliver the result back to wherever the flow started:
//
// - Embedded (popup): postMessage the result to the opener and close. The
//   builder (GoogleSheetsSettings) listens for it, refetches credentials and
//   selects the new one.
// - Standalone (no opener): fall back to the legacy behaviour of redirecting
//   the builder with `?blockId=` so it can refresh its credentials list.
const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return
    const blockId = firstQueryValue(router.query.blockId)
    const credentialsId = firstQueryValue(router.query.credentialsId)
    const redirectUrl = firstQueryValue(router.query.redirectUrl)

    const opener = globalThis.opener as WindowProxy | null
    if (opener && blockId && credentialsId) {
      const message: GoogleSheetsConnectedMessage = {
        type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
        blockId,
        credentialsId,
      }
      opener.postMessage(message, globalThis.location.origin)
      globalThis.close()
      return
    }

    if (redirectUrl) globalThis.location.replace(redirectUrl)
  }, [router.isReady, router.query])

  return (
    <Center h="100vh">
      <Spinner />
    </Center>
  )
}
