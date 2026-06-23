import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Center, Spinner, Text, VStack } from '@chakra-ui/react'
import { env } from '@typebot.io/env'
import { trpc } from '@/lib/trpc'
import {
  GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
  extractPickedSpreadsheetId,
  type GoogleSheetsSpreadsheetPickedMessage,
} from '@/features/blocks/integrations/googleSheets/helpers/popupMessaging'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any

// Top-level page that hosts the Google Drive Picker. Opened as a popup by
// GoogleSpreadsheetPicker so the Picker (which renders Google's account chooser)
// runs outside CloudChat's iframe, where Google would otherwise return 403.
//
// In embedded mode the popup carries embedded=true&jwt; EmbeddedAuthWrapper
// (in _app.tsx) runs the handshake and only renders this page once a first-party
// session exists, so the access-token query can safely fire — the builder's
// Partitioned NextAuth cookie is not sent to this top-level eddie context.
//
// The access token is fetched here via tRPC (never passed in the URL, to keep it
// out of the browser history). On selection the picked spreadsheet id is handed
// back to the opener via postMessage and the popup closes.
const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const loadGapiPicker = (onReady: () => void, onError: () => void) => {
  // Gate on the real object, not the <script> element: under StrictMode the
  // script can be present but still in-flight (window.gapi undefined), so
  // calling window.gapi.load would throw.
  if (window.gapi?.load) {
    window.gapi.load('picker', onReady)
    return
  }
  // Reuse the in-flight script if it exists; otherwise create it. Either way we
  // wait for its load. We use addEventListener (not onload=/onerror=) so
  // multiple mounts don't overwrite each other's handlers and so a handler
  // attached while the script is already in-flight still fires.
  let script = document.getElementById('gapi') as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.id = 'gapi'
    script.type = 'text/javascript'
    script.src = 'https://apis.google.com/js/api.js'
    document.head.appendChild(script)
  }
  script.addEventListener('load', () => window.gapi.load('picker', onReady))
  // If api.js can't load (offline, blocker, CSP), isPickerReady would never
  // flip and the popup would hang on a spinner. Surface the error state instead.
  script.addEventListener('error', onError)
}

export default function Page() {
  const router = useRouter()
  const [isPickerReady, setIsPickerReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const hasOpenedPicker = useRef(false)

  const workspaceId = firstQueryValue(router.query.workspaceId)
  const credentialsId = firstQueryValue(router.query.credentialsId)
  const blockId = firstQueryValue(router.query.blockId)

  const { data, error } = trpc.sheets.getAccessToken.useQuery(
    {
      workspaceId: workspaceId as string,
      credentialsId: credentialsId as string,
    },
    {
      enabled: router.isReady && !!workspaceId && !!credentialsId && !!blockId,
    }
  )

  // Required params missing: the query stays disabled, so close the popup
  // instead of hanging on a spinner forever.
  useEffect(() => {
    if (!router.isReady) return
    if (!workspaceId || !credentialsId || !blockId) globalThis.close()
  }, [router.isReady, workspaceId, credentialsId, blockId])

  useEffect(() => {
    loadGapiPicker(
      () => setIsPickerReady(true),
      () => setLoadError(true)
    )
  }, [])

  useEffect(() => {
    if (!isPickerReady || !data) return
    // Build the Picker exactly once. The effect re-runs on data/ready changes
    // (and twice under React StrictMode); a second PickerBuilder would stack a
    // duplicate overlay.
    if (hasOpenedPicker.current) return
    hasOpenedPicker.current = true

    const handlePicked = (picked: {
      action?: string
      docs?: { id?: string }[]
    }) => {
      // The user dismissed the Picker without choosing: close the popup so it
      // doesn't hang on a spinner. Other actions (e.g. 'loaded') are ignored.
      if (picked.action === 'cancel') {
        globalThis.close()
        return
      }
      const spreadsheetId = extractPickedSpreadsheetId(picked)
      if (!spreadsheetId || !blockId) return
      const opener = globalThis.opener as WindowProxy | null
      if (opener) {
        const message: GoogleSheetsSpreadsheetPickedMessage = {
          type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
          blockId,
          spreadsheetId,
        }
        opener.postMessage(message, globalThis.location.origin)
      }
      globalThis.close()
    }

    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(data.accessToken)
      .setDeveloperKey(env.NEXT_PUBLIC_GOOGLE_API_KEY)
      .setOrigin(globalThis.location.origin)
      .setCallback(handlePicked)
      .build()
    picker.setVisible(true)
  }, [isPickerReady, data, blockId])

  if (error || loadError)
    // Keep the error visible (the user needs to know what failed) but offer an
    // explicit way to dismiss the popup, so it isn't left orphaned.
    return (
      <Center h="100vh">
        <VStack spacing={2}>
          <Text fontWeight="semibold">
            Could not open the spreadsheet picker
          </Text>
          <Text color="gray.500">
            {error
              ? error.message
              : 'Failed to load Google APIs. Please check your connection and try again.'}
          </Text>
          <Button onClick={() => globalThis.close()}>Close</Button>
        </VStack>
      </Center>
    )

  return (
    <Center h="100vh">
      <Spinner />
    </Center>
  )
}
