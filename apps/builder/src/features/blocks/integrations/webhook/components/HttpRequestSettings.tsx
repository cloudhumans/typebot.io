import React, { useState } from 'react'
import {
  Stack,
  HStack,
  Box,
  Tag,
  TagLeftIcon,
  Text,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react'
import { HttpRequest, HttpRequestBlock } from '@typebot.io/schemas'
import { TextInput } from '@/components/inputs'
import { HttpRequestAdvancedConfigForm } from './HttpRequestAdvancedConfigForm'
import { CredentialsDropdown } from '@/features/credentials/components/CredentialsDropdown'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { trpc } from '@/lib/trpc'
import { LockedIcon } from '@/components/icons'
import { RestApiCredentialsModal } from './RestApiCredentialsModal'
import { normalizeCredentialsId } from '@typebot.io/schemas/features/blocks/integrations/webhook/credentialsId'
import { useTranslate } from '@tolgee/react'

type Props = {
  block: HttpRequestBlock
  onOptionsChange: (options: HttpRequestBlock['options']) => void
}

export const HttpRequestSettings = ({
  block: { id: blockId, options },
  onOptionsChange,
}: Props) => {
  const { t } = useTranslate()
  const { workspace } = useWorkspace()
  const { revalidate } = useEditor()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [editingCredentialsId, setEditingCredentialsId] = useState<string>()
  const credentialsId = normalizeCredentialsId(options?.credentialsId)
  const isSecureMode = !!credentialsId

  const {
    data: credential,
    isError: isCredentialError,
    error: credentialError,
  } = trpc.credentials.getRestApiCredential.useQuery(
    {
      workspaceId: workspace?.id as string,
      credentialsId: credentialsId as string,
    },
    { enabled: !!workspace?.id && !!credentialsId, retry: false }
  )
  // A decrypt failure (rotated ENCRYPTION_SECRET / corrupt IV) returns
  // INTERNAL_SERVER_ERROR, not NOT_FOUND — show a read error, not a deletion hint.
  const credentialErrorMessage = t(
    credentialError?.data?.code === 'INTERNAL_SERVER_ERROR'
      ? 'blocks.integrations.httpRequest.credentials.readError'
      : 'blocks.integrations.httpRequest.credentials.notFound'
  )

  const setLocalWebhook = async (newLocalWebhook: HttpRequest) => {
    onOptionsChange({ ...options, webhook: newLocalWebhook })
  }

  const updateUrl = (url: string) => {
    onOptionsChange({ ...options, webhook: { ...options?.webhook, url } })
  }

  const updateCredentialsId = (newCredentialsId?: string) => {
    // Normalize the dropdown sentinel (and empty) to undefined so the block falls
    // back to custom URL.
    const normalized = normalizeCredentialsId(newCredentialsId)
    // Reset the URL field: a full URL typed in custom mode is invalid as a path
    // suffix once a credential is active (and vice-versa), so don't carry it over.
    onOptionsChange({
      ...options,
      credentialsId: normalized,
      webhook: { ...options?.webhook, url: '' },
    })
  }

  return (
    <Stack spacing={4}>
      {workspace && (
        <CredentialsDropdown
          type="rest-api"
          workspaceId={workspace.id}
          currentCredentialsId={credentialsId}
          onCredentialsSelect={updateCredentialsId}
          onCreateNewClick={() => {
            setEditingCredentialsId(undefined)
            onOpen()
          }}
          onEditClick={(id) => {
            setEditingCredentialsId(id)
            onOpen()
          }}
          credentialsName={t(
            'blocks.integrations.httpRequest.credentials.name'
          )}
          defaultCredentialLabel={t(
            'blocks.integrations.httpRequest.credentials.noCredentialLabel'
          )}
        />
      )}
      {isSecureMode ? (
        isCredentialError ? (
          <Tag size="lg" colorScheme="red" alignSelf="flex-start">
            <Text>{credentialErrorMessage}</Text>
          </Tag>
        ) : (
          <HStack align="stretch">
            <Tooltip label={credential?.baseUrl ?? ''} placement="top" hasArrow>
              <Tag size="lg" colorScheme="gray" flexShrink={0} maxW="45%">
                <TagLeftIcon as={LockedIcon} />
                <Text noOfLines={1}>{credential?.baseUrl ?? '…'}</Text>
              </Tag>
            </Tooltip>
            <Box flex="1">
              <TextInput
                key={`suffix-${credentialsId}`}
                flushOnUnmount={false}
                aria-label={t(
                  'blocks.integrations.httpRequest.pathSuffix.placeholder'
                )}
                placeholder={t(
                  'blocks.integrations.httpRequest.pathSuffix.placeholder'
                )}
                defaultValue={options?.webhook?.url}
                onChange={updateUrl}
              />
            </Box>
          </HStack>
        )
      ) : (
        <TextInput
          key="custom-url"
          // Switching to secure mode unmounts this input; flushing a pending edit
          // here would call updateUrl with a stale `options` closure and clobber
          // the just-set credentialsId / url reset. Cancel the pending edit instead.
          flushOnUnmount={false}
          placeholder={t('blocks.integrations.httpRequest.url.placeholder')}
          defaultValue={options?.webhook?.url}
          onChange={updateUrl}
        />
      )}
      <HttpRequestAdvancedConfigForm
        blockId={blockId}
        webhook={options?.webhook}
        options={options}
        inheritedHeaders={credentialsId ? credential?.headers : undefined}
        inheritedQueryParams={
          credentialsId ? credential?.queryParams : undefined
        }
        onWebhookChange={setLocalWebhook}
        onOptionsChange={onOptionsChange}
      />
      <RestApiCredentialsModal
        isOpen={isOpen}
        onClose={() => {
          setEditingCredentialsId(undefined)
          onClose()
        }}
        onNewCredentials={updateCredentialsId}
        editingCredentialsId={editingCredentialsId}
        onUpdated={() => revalidate?.()}
        onDeleted={(id) => {
          if (id === credentialsId) updateCredentialsId(undefined)
          else revalidate?.()
        }}
      />
    </Stack>
  )
}
