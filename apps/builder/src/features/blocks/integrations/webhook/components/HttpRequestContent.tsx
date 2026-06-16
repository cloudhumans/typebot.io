import { Stack, Text, Tooltip } from '@chakra-ui/react'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { HttpRequestBlock } from '@typebot.io/schemas'
import { SetVariableLabel } from '@/components/SetVariableLabel'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { trpc } from '@/lib/trpc'
import { LockedIcon } from '@/components/icons'

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
  const { typebot } = useTypebot()
  const { workspace } = useWorkspace()
  const webhook = options?.webhook
  const credentialsId = options?.credentialsId

  const { data: credential } = trpc.credentials.getRestApiCredential.useQuery(
    {
      workspaceId: workspace?.id as string,
      credentialsId: credentialsId as string,
    },
    { enabled: !!workspace?.id && !!credentialsId && credentialsId !== 'default' }
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
        <Text noOfLines={3} pr="6">
          {webhook?.method}{' '}
          <Tooltip
            label="Secure mode: the base URL and secret headers/params come from the selected credential and are masked in logs."
            hasArrow
          >
            <LockedIcon
              verticalAlign="text-bottom"
              position="relative"
              top="-2px"
            />
          </Tooltip>{' '}
          {displayUrl ?? 'Configure...'}
        </Text>
        {responseMappings}
      </Stack>
    )
  }

  if (!webhook?.url) return <Text color="gray.500">Configure...</Text>
  return (
    <Stack w="full">
      <Text noOfLines={2} pr="6">
        {webhook.method} {webhook.url}
      </Text>
      {responseMappings}
    </Stack>
  )
}
