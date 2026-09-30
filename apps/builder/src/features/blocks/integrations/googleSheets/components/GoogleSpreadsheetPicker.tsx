import { FileIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import { Button, Flex, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GoogleSheetsLogo } from './GoogleSheetsLogo'
import { SpreadsheetLinkInput } from './SpreadsheetLinkInput'
import { isDefined } from '@typebot.io/lib'
import { useToast } from '@/hooks/useToast'
import { useTranslate } from '@tolgee/react'
import {
  isPublishedSpreadsheetLink,
  parseSpreadsheetId,
} from '../helpers/parseSpreadsheetId'
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
  const trpcContext = trpc.useContext()
  const [linkErrorMessage, setLinkErrorMessage] = useState<string>()
  const [isCheckingLink, setIsCheckingLink] = useState(false)
  const latestCredentialsId = useRef(credentialsId)
  const latestOnSpreadsheetIdChange = useRef(onSpreadsheetIdChange)
  useEffect(() => {
    latestCredentialsId.current = credentialsId
    latestOnSpreadsheetIdChange.current = onSpreadsheetIdChange
  })
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
        description: t('blocks.integrations.googleSheets.picker.popupBlocked'),
      })
  }, [workspaceId, credentialsId, blockId, searchParams, showToast, t])

  const toAccessErrorMessage = (
    data: NonNullable<typeof spreadsheetData>
  ): string | undefined => {
    if (!('error' in data)) return
    switch (data.error) {
      case 'FORBIDDEN':
        return t('blocks.integrations.googleSheets.picker.error.forbidden', {
          email: data.accountEmail,
        })
      case 'NOT_FOUND':
        return t('blocks.integrations.googleSheets.picker.error.notFound')
      case 'UNAUTHORIZED':
        return t('blocks.integrations.googleSheets.picker.error.unauthorized', {
          email: data.accountEmail,
        })
      case 'UNSUPPORTED_DOCUMENT':
        return t(
          'blocks.integrations.googleSheets.picker.error.unsupportedDocument'
        )
      default:
        return t('blocks.integrations.googleSheets.picker.error.unknown')
    }
  }

  const applySpreadsheetLink = async (link: string): Promise<boolean> => {
    if (isPublishedSpreadsheetLink(link)) {
      setLinkErrorMessage(
        t('blocks.integrations.googleSheets.picker.pasteLink.publishedLink')
      )
      return false
    }
    const pastedSpreadsheetId = parseSpreadsheetId(link)
    if (!pastedSpreadsheetId) {
      setLinkErrorMessage(
        t('blocks.integrations.googleSheets.picker.pasteLink.invalid')
      )
      return false
    }
    setLinkErrorMessage(undefined)
    setIsCheckingLink(true)
    try {
      const pastedSpreadsheet =
        await trpcContext.sheets.getSpreadsheetName.fetch({
          workspaceId,
          credentialsId,
          spreadsheetId: pastedSpreadsheetId,
        })
      if (latestCredentialsId.current !== credentialsId) return false
      const accessError = toAccessErrorMessage(pastedSpreadsheet)
      if (accessError) {
        setLinkErrorMessage(accessError)
        return false
      }
      latestOnSpreadsheetIdChange.current(pastedSpreadsheetId)
      return true
    } catch {
      setLinkErrorMessage(
        t('blocks.integrations.googleSheets.picker.error.unknown')
      )
      return false
    } finally {
      setIsCheckingLink(false)
    }
  }

  const accessErrorMessage = spreadsheetData
    ? toAccessErrorMessage(spreadsheetData)
    : undefined

  const renderLinkInput = (isCollapsible: boolean) => (
    <SpreadsheetLinkInput
      isCollapsible={isCollapsible}
      isLoading={isCheckingLink}
      errorMessage={linkErrorMessage}
      onChange={() => setLinkErrorMessage(undefined)}
      onSubmit={applySpreadsheetLink}
    />
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
            aria-label={t(
              'blocks.integrations.googleSheets.picker.pickAnother'
            )}
          />
        </Flex>
        {renderLinkInput(true)}
      </Stack>
    )
  return (
    <Stack spacing={3}>
      <Button
        onClick={openPicker}
        isLoading={isDefined(spreadsheetId) && status === 'loading'}
      >
        {t('blocks.integrations.googleSheets.picker.pickButton')}
      </Button>
      {accessErrorMessage && (
        <Text fontSize="sm" color="red.500">
          {accessErrorMessage}
        </Text>
      )}
      {renderLinkInput(false)}
    </Stack>
  )
}
