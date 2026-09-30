import { Button, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useTranslate } from '@tolgee/react'
import React, { useState } from 'react'

type Props = {
  isCollapsible: boolean
  isLoading: boolean
  errorMessage?: string
  onChange: () => void
  onCancel: () => void
  onSubmit: (link: string) => Promise<boolean>
}

export const SpreadsheetLinkInput = ({
  isCollapsible,
  isLoading,
  errorMessage,
  onChange,
  onCancel,
  onSubmit,
}: Props) => {
  const { t } = useTranslate()
  const [link, setLink] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const submit = async () => {
    if (isLoading || link.trim() === '') return
    if (await onSubmit(link)) {
      setLink('')
      setIsExpanded(false)
    }
  }

  if (isCollapsible && !isExpanded && !errorMessage)
    return (
      <Button
        size="sm"
        variant="link"
        alignSelf="flex-start"
        fontWeight="normal"
        onClick={() => setIsExpanded(true)}
      >
        {t('blocks.integrations.googleSheets.picker.pasteLink.label')}
      </Button>
    )

  return (
    <Stack spacing={1}>
      <Text fontSize="sm" color="gray.500">
        {t('blocks.integrations.googleSheets.picker.pasteLink.label')}
      </Text>
      <Input
        size="sm"
        value={link}
        autoFocus={isCollapsible}
        placeholder={t(
          'blocks.integrations.googleSheets.picker.pasteLink.placeholder'
        )}
        onChange={(e) => {
          setLink(e.target.value)
          onChange()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
      <HStack justifyContent="flex-end">
        {isCollapsible && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLink('')
              setIsExpanded(false)
              onCancel()
            }}
          >
            {t('cancel')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={submit}
          isLoading={isLoading}
          isDisabled={link.trim() === ''}
        >
          {t('blocks.integrations.googleSheets.picker.pasteLink.apply')}
        </Button>
      </HStack>
      {errorMessage && (
        <Text fontSize="sm" color="red.500">
          {errorMessage}
        </Text>
      )}
    </Stack>
  )
}
