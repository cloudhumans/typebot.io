import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Center, Spinner, Text, VStack } from '@chakra-ui/react'
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

const loadGapiPicker = (onReady: () => void) => {
  const existingScript = document.getElementById('gapi')
  if (existingScript) {
    window.gapi.load('picker', onReady)
    return
  }
  const script = document.createElement('script')
  script.id = 'gapi'
  script.type = 'text/javascript'
  script.src = 'https://apis.google.com/js/api.js'
  script.onload = () => window.gapi.load('picker', onReady)
  document.head.appendChild(script)
}

export default function Page() {
  const router = useRouter()
  const [isPickerReady, setIsPickerReady] = useState(false)

  const workspaceId = firstQueryValue(router.query.workspaceId)
  const credentialsId = firstQueryValue(router.query.credentialsId)

  const { data, error } = trpc.sheets.getAccessToken.useQuery(
    {
      workspaceId: workspaceId as string,
      credentialsId: credentialsId as string,
    },
    { enabled: router.isReady && !!workspaceId && !!credentialsId }
  )

  useEffect(() => {
    loadGapiPicker(() => setIsPickerReady(true))
  }, [])

  useEffect(() => {
    if (!isPickerReady || !data) return

    const handlePicked = (picked: {
      action?: string
      docs?: { id?: string }[]
    }) => {
      const spreadsheetId = extractPickedSpreadsheetId(picked)
      if (!spreadsheetId) return
      const opener = globalThis.opener as WindowProxy | null
      if (opener) {
        const message: GoogleSheetsSpreadsheetPickedMessage = {
          type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
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
  }, [isPickerReady, data])

  if (error)
    return (
      <Center h="100vh">
        <VStack spacing={2}>
          <Text fontWeight="semibold">
            Could not open the spreadsheet picker
          </Text>
          <Text color="gray.500">{error.message}</Text>
        </VStack>
      </Center>
    )

  return (
    <Center h="100vh">
      <Spinner />
    </Center>
  )
}
