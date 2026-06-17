import { Stack, Text, Tooltip } from '@chakra-ui/react'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { HttpRequestBlock } from '@typebot.io/schemas'
import { SetVariableLabel } from '@/components/SetVariableLabel'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { trpc } from '@/lib/trpc'
import { LockedIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'
import { defaultWebhookAttributes } from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'

type Props = {
  block: HttpRequestBlock
}

const joinUrl = (base: string, suffix?: string) => {
  if (!suffix) return base
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${cleanBase}${cleanSuffix}`
}

export const WebhookContent = ({ block: { options } }: Props) => {
  const { t } = useTranslate()
  const { typebot } = useTypebot()
  const { workspace } = useWorkspace()
  const webhook = options?.webhook
  // The dropdown emits 'default' to mean "no credentials"; treat it as absence.
  const credentialsId =
    options?.credentialsId && options.credentialsId !== 'default'
      ? options.credentialsId
      : undefined
  const method = webhook?.method ?? defaultWebhookAttributes.method

  const { data: credential } = trpc.credentials.getRestApiCredential.useQuery(
    {
      workspaceId: workspace?.id as string,
      credentialsId: credentialsId as string,
    },
    { enabled: !!workspace?.id && !!credentialsId }
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
    const displayUrl = credential
      ? joinUrl(credential.baseUrl, webhook?.url ?? undefined)
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
