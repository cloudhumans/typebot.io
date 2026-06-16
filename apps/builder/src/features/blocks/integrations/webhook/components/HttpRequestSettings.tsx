import React from 'react'
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
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { trpc } from '@/lib/trpc'
import { LockedIcon } from '@/components/icons'
import { RestApiCredentialsModal } from './RestApiCredentialsModal'

type Props = {
  block: HttpRequestBlock
  onOptionsChange: (options: HttpRequestBlock['options']) => void
}

export const HttpRequestSettings = ({
  block: { id: blockId, options },
  onOptionsChange,
}: Props) => {
  const { workspace } = useWorkspace()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const credentialsId = options?.credentialsId

  const { data: credential } = trpc.credentials.getRestApiCredential.useQuery(
    { workspaceId: workspace?.id as string, credentialsId: credentialsId as string },
    { enabled: !!workspace?.id && !!credentialsId && credentialsId !== 'default' }
  )

  const setLocalWebhook = async (newLocalWebhook: HttpRequest) => {
    onOptionsChange({ ...options, webhook: newLocalWebhook })
  }

  const updateUrl = (url: string) => {
    onOptionsChange({ ...options, webhook: { ...options?.webhook, url } })
  }

  const updateCredentialsId = (newCredentialsId?: string) => {
    // The dropdown emits the sentinel 'default' for the "no credentials" option.
    // Normalize it (and empty) to undefined so the block falls back to custom URL.
    const normalized =
      newCredentialsId && newCredentialsId !== 'default'
        ? newCredentialsId
        : undefined
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
          onCreateNewClick={onOpen}
          credentialsName="REST API credentials"
          defaultCredentialLabel="No credentials (custom URL)"
          size="sm"
        />
      )}
      {credentialsId && credential ? (
        <HStack align="stretch">
          <Tooltip label={credential.baseUrl} placement="top" hasArrow>
            <Tag size="lg" colorScheme="gray" flexShrink={0} maxW="45%">
              <TagLeftIcon as={LockedIcon} />
              <Text noOfLines={1}>{credential.baseUrl}</Text>
            </Tag>
          </Tooltip>
          <Box flex="1">
            <TextInput
              key={`suffix-${credentialsId}`}
              placeholder="/path/suffix"
              defaultValue={options?.webhook?.url}
              onChange={updateUrl}
            />
          </Box>
        </HStack>
      ) : (
        <TextInput
          key="custom-url"
          placeholder="Paste URL..."
          defaultValue={options?.webhook?.url}
          onChange={updateUrl}
        />
      )}
      <HttpRequestAdvancedConfigForm
        blockId={blockId}
        webhook={options?.webhook}
        options={options}
        inheritedHeaders={credentialsId ? credential?.headers : undefined}
        inheritedQueryParams={credentialsId ? credential?.queryParams : undefined}
        onWebhookChange={setLocalWebhook}
        onOptionsChange={onOptionsChange}
      />
      <RestApiCredentialsModal
        isOpen={isOpen}
        onClose={onClose}
        onNewCredentials={updateCredentialsId}
      />
    </Stack>
  )
}
