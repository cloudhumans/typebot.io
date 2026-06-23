import { FileIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import { Button, Flex, HStack, IconButton, Text } from '@chakra-ui/react'
import React, { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { GoogleSheetsLogo } from './GoogleSheetsLogo'
import { isDefined } from '@typebot.io/lib'
import { useToast } from '@/hooks/useToast'
import { parseGoogleSheetsSpreadsheetPickedMessage } from '../helpers/popupMessaging'
import {
  appendEmbeddedAuthParams,
  readEmbeddedAuthParams,
} from '../helpers/embeddedPopupParams'

type Props = {
  spreadsheetId?: string
  credentialsId: string
  workspaceId: string
  blockId: string
  onSpreadsheetIdSelect: (spreadsheetId: string) => void
}

export const GoogleSpreadsheetPicker = ({
  spreadsheetId,
  workspaceId,
  credentialsId,
  blockId,
  onSpreadsheetIdSelect,
}: Props) => {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const { data: spreadsheetData, status } =
    trpc.sheets.getSpreadsheetName.useQuery(
      {
        workspaceId,
        credentialsId,
        spreadsheetId: spreadsheetId as string,
      },
      { enabled: !!spreadsheetId }
    )

  // The Picker runs in a top-level popup (see pages/google-picker.tsx) so it
  // works both standalone and embedded inside CloudChat's iframe, where Google
  // refuses to render its account chooser. The popup hands the picked
  // spreadsheet id back here via postMessage. We require the message's blockId
  // to match ours so a pick can't land on the wrong block if the user switched
  // blocks while the popup was open.
  //
  // onSpreadsheetIdSelect is recreated by the parent each render; read it from a
  // ref so the listener stays registered for the popup's whole lifetime instead
  // of being torn down/re-added every render (which could drop a message).
  const onSpreadsheetIdSelectRef = useRef(onSpreadsheetIdSelect)
  onSpreadsheetIdSelectRef.current = onSpreadsheetIdSelect
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== globalThis.location.origin) return
      const message = parseGoogleSheetsSpreadsheetPickedMessage(event.data)
      if (!message || message.blockId !== blockId) return
      onSpreadsheetIdSelectRef.current(message.spreadsheetId)
    }
    globalThis.addEventListener('message', handleMessage)
    return () => globalThis.removeEventListener('message', handleMessage)
  }, [blockId])

  // Embedded: forward embedded=true&jwt so the picker popup (top-level on
  // eddie, no first-party session) can authenticate itself before fetching the
  // access token. Standalone: open without them.
  const openPicker = useCallback(() => {
    const params = appendEmbeddedAuthParams(
      new URLSearchParams({ workspaceId, credentialsId, blockId }),
      readEmbeddedAuthParams(searchParams)
    )
    const popup = globalThis.open(
      `/google-picker?${params.toString()}`,
      'gs-picker',
      'popup,width=720,height=600'
    )
    // A null handle means the browser blocked the popup; warn the user.
    if (!popup)
      showToast({
        description: 'Please allow popups for this site to pick a spreadsheet.',
      })
  }, [workspaceId, credentialsId, blockId, searchParams, showToast])

  if (spreadsheetData && spreadsheetData.name !== '')
    return (
      <Flex justifyContent="space-between">
        <HStack spacing={2}>
          <GoogleSheetsLogo />
          <Text fontWeight="semibold">{spreadsheetData.name}</Text>
        </HStack>
        <IconButton
          size="sm"
          icon={<FileIcon />}
          onClick={openPicker}
          aria-label={'Pick another spreadsheet'}
        />
      </Flex>
    )
  return (
    <Button
      onClick={openPicker}
      isLoading={isDefined(spreadsheetId) && status === 'loading'}
    >
      Pick a spreadsheet
    </Button>
  )
}
