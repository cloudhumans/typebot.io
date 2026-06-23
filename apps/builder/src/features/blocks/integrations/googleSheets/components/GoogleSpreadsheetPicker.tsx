import { FileIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import { Button, Flex, HStack, IconButton, Text } from '@chakra-ui/react'
import React, { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { GoogleSheetsLogo } from './GoogleSheetsLogo'
import { isDefined } from '@typebot.io/lib'
import { useToast } from '@/hooks/useToast'
import {
  appendEmbeddedAuthParams,
  readEmbeddedAuthParams,
} from '../helpers/embeddedPopupParams'

type Props = {
  spreadsheetId?: string
  credentialsId: string
  workspaceId: string
  blockId: string
}

// This component only opens the picker popup and renders the current
// spreadsheet's label. The picked result is applied by the durable
// useGoogleSheetsOAuthListener (mounted at the editor root), which survives this
// panel unmounting while the popup is open — so there's no onSelect callback or
// message listener here.
export const GoogleSpreadsheetPicker = ({
  spreadsheetId,
  workspaceId,
  credentialsId,
  blockId,
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
