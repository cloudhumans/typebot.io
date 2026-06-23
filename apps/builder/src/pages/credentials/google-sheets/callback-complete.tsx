import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Center, Spinner } from '@chakra-ui/react'
import {
  GOOGLE_SHEETS_CONNECTED_MESSAGE,
  GOOGLE_SHEETS_OAUTH_CHANNEL,
  type GoogleSheetsConnectedMessage,
} from '@/features/blocks/integrations/googleSheets/helpers/popupMessaging'

// Terminal page of the Google Sheets OAuth flow. The callback API route has
// already created the Credentials and persisted credentialsId on the block, so
// this page only has to deliver the result back to wherever the flow started:
//
// - Popup (the normal case): broadcast the result on the same-origin
//   BroadcastChannel and close. The builder (useGoogleSheetsOAuthListener)
//   receives it and applies the credentialsId to the block. We broadcast rather
//   than use window.opener because COOP can sever the opener across the Google
//   OAuth navigation; BroadcastChannel is opener-independent.
// - Direct access without the ids to broadcast: fall back to a same-origin
//   redirect to the builder with `?blockId=` so it can refresh from the
//   server-persisted state.
const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

// This page is unauthenticated and reachable directly, so the query-supplied
// redirectUrl is attacker-controllable. Only navigate to it when it is
// same-origin (the legitimate case redirects back to our own builder); reject
// external or malformed URLs to avoid an open redirect.
const isSameOriginUrl = (url: string): boolean => {
  try {
    return new URL(url).origin === globalThis.location.origin
  } catch {
    return false
  }
}

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return
    const blockId = firstQueryValue(router.query.blockId)
    const credentialsId = firstQueryValue(router.query.credentialsId)
    const redirectUrl = firstQueryValue(router.query.redirectUrl)

    if (blockId && credentialsId) {
      const message: GoogleSheetsConnectedMessage = {
        type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
        blockId,
        credentialsId,
      }
      // Broadcast unconditionally (not gated on window.opener): COOP may have
      // severed the opener across the Google OAuth navigation, which is exactly
      // when we still need to deliver. The builder receives it on the channel.
      const channel = new BroadcastChannel(GOOGLE_SHEETS_OAUTH_CHANNEL)
      channel.postMessage(message)
      // BroadcastChannel delivery across windows is async; closing in the same
      // tick can drop the message. Give it a moment to flush before closing.
      const timeout = globalThis.setTimeout(() => {
        channel.close()
        globalThis.close()
      }, 200)
      return () => globalThis.clearTimeout(timeout)
    }

    // Direct access without the ids to broadcast: send the builder back, but
    // only for a same-origin redirectUrl. Anything external/invalid (or absent)
    // → close.
    if (redirectUrl && isSameOriginUrl(redirectUrl)) {
      globalThis.location.replace(redirectUrl)
      return
    }
    globalThis.close()
  }, [router.isReady, router.query])

  return (
    <Center h="100vh">
      <Spinner />
    </Center>
  )
}
