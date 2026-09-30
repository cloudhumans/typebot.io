import { FileIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import {
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import React, { useCallback, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GoogleSheetsLogo } from './GoogleSheetsLogo'
import { isDefined } from '@typebot.io/lib'
import { useToast } from '@/hooks/useToast'
import { useTranslate } from '@tolgee/react'
import { parseSpreadsheetId } from '../helpers/parseSpreadsheetId'
import {
  appendEmbeddedAuthParams,
  readEmbeddedAuthParams,
} from '../helpers/embeddedPopupParams'

type Props = {
  spreadsheetId?: string
  credentialsId: string
  workspaceId: string
  blockId: string
  onSpreadsheetIdChange: (spreadsheetId: string) => void
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
  onSpreadsheetIdChange,
}: Props) => {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const { t } = useTranslate()
  const [spreadsheetLink, setSpreadsheetLink] = useState('')
  const [isLinkInvalid, setIsLinkInvalid] = useState(false)
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

  const applySpreadsheetLink = () => {
    const pastedSpreadsheetId = parseSpreadsheetId(spreadsheetLink)
    if (!pastedSpreadsheetId) {
      setIsLinkInvalid(true)
      return
    }
    setIsLinkInvalid(false)
    setSpreadsheetLink('')
    onSpreadsheetIdChange(pastedSpreadsheetId)
  }

  const accessErrorMessage = (() => {
    if (!spreadsheetData || !('error' in spreadsheetData)) return
    switch (spreadsheetData.error) {
      case 'FORBIDDEN':
        return t('blocks.integrations.googleSheets.picker.error.forbidden', {
          email: spreadsheetData.accountEmail,
        })
      case 'NOT_FOUND':
        return t('blocks.integrations.googleSheets.picker.error.notFound')
      default:
        return t('blocks.integrations.googleSheets.picker.error.unknown')
    }
  })()

  const pasteLinkInput = (
    <Stack spacing={1}>
      <Text fontSize="sm" color="gray.500">
        {t('blocks.integrations.googleSheets.picker.pasteLink.label')}
      </Text>
      <HStack>
        <Input
          size="sm"
          value={spreadsheetLink}
          placeholder={t(
            'blocks.integrations.googleSheets.picker.pasteLink.placeholder'
          )}
          onChange={(e) => {
            setSpreadsheetLink(e.target.value)
            setIsLinkInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySpreadsheetLink()
          }}
        />
        <Button
          size="sm"
          flexShrink={0}
          onClick={applySpreadsheetLink}
          isDisabled={spreadsheetLink.trim() === ''}
        >
          {t('blocks.integrations.googleSheets.picker.pasteLink.apply')}
        </Button>
      </HStack>
      {isLinkInvalid && (
        <Text fontSize="sm" color="red.500">
          {t('blocks.integrations.googleSheets.picker.pasteLink.invalid')}
        </Text>
      )}
    </Stack>
  )

  if (spreadsheetData && spreadsheetData.name !== '')
    return (
      <Stack spacing={3}>
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
        {pasteLinkInput}
      </Stack>
    )
  return (
    <Stack spacing={3}>
      <Button
        onClick={openPicker}
        isLoading={isDefined(spreadsheetId) && status === 'loading'}
      >
        Pick a spreadsheet
      </Button>
      {accessErrorMessage && (
        <Text fontSize="sm" color="red.500">
          {accessErrorMessage}
        </Text>
      )}
      {pasteLinkInput}
    </Stack>
  )
}
