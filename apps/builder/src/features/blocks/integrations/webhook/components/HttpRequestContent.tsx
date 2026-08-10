import { Stack, Text, Tooltip } from '@chakra-ui/react'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { HttpRequestBlock } from '@typebot.io/schemas'
import { SetVariableLabel } from '@/components/SetVariableLabel'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { trpc } from '@/lib/trpc'
import { LockedIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'
import { defaultWebhookAttributes } from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'
import { concatUrlPath } from '@typebot.io/schemas/features/blocks/integrations/webhook/urlHelpers'
import { normalizeCredentialsId } from '@typebot.io/schemas/features/blocks/integrations/webhook/credentialsId'

type Props = {
  block: HttpRequestBlock
}

export const WebhookContent = ({ block: { options } }: Props) => {
  const { t } = useTranslate()
  const { typebot } = useTypebot()
  const { workspace } = useWorkspace()
  const webhook = options?.webhook
  const credentialsId = normalizeCredentialsId(options?.credentialsId)
  const method = webhook?.method ?? defaultWebhookAttributes.method

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

  const responseMappings = options?.responseVariableMapping
    ?.filter((mapping) => mapping.variableId)
    .map((mapping) => (
      <SetVariableLabel
        key={mapping.variableId}
        variableId={mapping.variableId as string}
        variables={typebot?.variables}
      />
    ))

  if (credentialsId) {
    // The referenced credential was deleted or is unresolvable: don't render a
    // lock + path suffix, which would imply a working secure request to a URL
    // that no longer exists. Surface the broken state instead.
    if (isCredentialError)
      return (
        <Text color="red.500" noOfLines={2} pr="6">
          {t(
            credentialError?.data?.code === 'INTERNAL_SERVER_ERROR'
              ? 'blocks.integrations.httpRequest.credentials.readError'
              : 'blocks.integrations.httpRequest.credentials.notFound'
          )}
        </Text>
      )
    const displayUrl = credential
      ? concatUrlPath(credential.baseUrl, webhook?.url ?? undefined)
      : webhook?.url
    return (
      <Stack w="full">
        <Text noOfLines={2} pr="6">
          {method}{' '}
          <Tooltip
            label={t('blocks.integrations.httpRequest.secureMode.tooltip')}
            hasArrow
            shouldWrapChildren
          >
            <LockedIcon verticalAlign="middle" />
          </Tooltip>{' '}
          {displayUrl || t('blocks.integrations.httpRequest.configure.label')}
        </Text>
        {responseMappings}
      </Stack>
    )
  }

  if (!webhook?.url)
    return (
      <Text color="gray.500">
        {t('blocks.integrations.httpRequest.configure.label')}
      </Text>
    )
  return (
    <Stack w="full">
      <Text noOfLines={2} pr="6">
        {method} {webhook.url}
      </Text>
      {responseMappings}
    </Stack>
  )
}
