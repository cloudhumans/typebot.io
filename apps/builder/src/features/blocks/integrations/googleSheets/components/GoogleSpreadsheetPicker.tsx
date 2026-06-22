import { FileIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import { Button, Flex, HStack, IconButton, Text } from '@chakra-ui/react'
import React, { useCallback, useEffect } from 'react'
import { GoogleSheetsLogo } from './GoogleSheetsLogo'
import { isDefined } from '@typebot.io/lib'
import { parseGoogleSheetsSpreadsheetPickedMessage } from '../helpers/popupMessaging'

type Props = {
  spreadsheetId?: string
  credentialsId: string
  workspaceId: string
  onSpreadsheetIdSelect: (spreadsheetId: string) => void
}

export const GoogleSpreadsheetPicker = ({
  spreadsheetId,
  workspaceId,
  credentialsId,
  onSpreadsheetIdSelect,
}: Props) => {
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
  // spreadsheet id back here via postMessage.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== globalThis.location.origin) return
      const message = parseGoogleSheetsSpreadsheetPickedMessage(event.data)
      if (!message) return
      onSpreadsheetIdSelect(message.spreadsheetId)
    }
    globalThis.addEventListener('message', handleMessage)
    return () => globalThis.removeEventListener('message', handleMessage)
  }, [onSpreadsheetIdSelect])

  const openPicker = useCallback(() => {
    const params = new URLSearchParams({ workspaceId, credentialsId })
    globalThis.open(
      `/google-picker?${params.toString()}`,
      'gs-picker',
      'popup,width=720,height=600'
    )
  }, [workspaceId, credentialsId])

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
