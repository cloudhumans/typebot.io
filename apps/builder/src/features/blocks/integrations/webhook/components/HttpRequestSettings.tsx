import React from 'react'
import {
  Stack,
  HStack,
  Box,
  Tag,
  TagLeftIcon,
  Text,
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
    { enabled: !!workspace?.id && !!credentialsId }
  )

  const setLocalWebhook = async (newLocalWebhook: HttpRequest) => {
    onOptionsChange({ ...options, webhook: newLocalWebhook })
  }

  const updateUrl = (url: string) => {
    onOptionsChange({ ...options, webhook: { ...options?.webhook, url } })
  }

  const updateCredentialsId = (newCredentialsId?: string) => {
    onOptionsChange({ ...options, credentialsId: newCredentialsId })
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
          <Tag size="lg" colorScheme="gray" flexShrink={0} maxW="50%">
            <TagLeftIcon as={LockedIcon} />
            <Text noOfLines={1}>{credential.baseUrl}</Text>
          </Tag>
          <Box flex="1">
            <TextInput
              placeholder="/path/suffix"
              defaultValue={options?.webhook?.url}
              onChange={updateUrl}
            />
          </Box>
        </HStack>
      ) : (
        <TextInput
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
