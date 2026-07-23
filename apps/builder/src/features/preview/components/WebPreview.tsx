import { WebhookIcon } from '@/components/icons'
import { useUser } from '@/features/account/hooks/useUser'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useGraph } from '@/features/graph/providers/GraphProvider'
import { useToast } from '@/hooks/useToast'
import { Standard } from '@typebot.io/nextjs'
import { ContinueChatResponse } from '@typebot.io/schemas'
import { DebugVariable } from './DebugVariablesPanel'
import { ComponentProps, useEffect, useRef } from 'react'

type Props = {
  onNewVariables?: (variables: DebugVariable[]) => void
}

export const WebPreview = ({ onNewVariables }: Props) => {
  const { user } = useUser()
  const { typebot } = useTypebot()
  const { startPreviewAtGroup, startPreviewAtEvent } = useEditor()
  const { setPreviewingBlock } = useGraph()

  const { showToast } = useToast()

  const handleNewLogs = (logs: ContinueChatResponse['logs']) => {
    logs?.forEach((log) => {
      showToast({
        icon: <WebhookIcon />,
        status: log.status as 'success' | 'error' | 'info',
        title: log.status === 'error' ? 'An error occured' : undefined,
        description: log.description,
        details: log.details
          ? {
              lang: 'json',
              content:
                typeof log.details === 'string'
                  ? log.details
                  : JSON.stringify(log.details, null, 2),
            }
          : undefined,
      })
      if (log.status === 'error') console.error(log)
    })
  }

  if (!typebot) return null

  // `key` amarra a identidade da execução (typebot + grupo/evento de início).
  // Quando muda, o PreviewBot remonta — o que invalida o guard de variáveis da
  // execução anterior e limpa o painel, tanto no restart quanto ao dar play num
  // grupo/evento específico.
  return (
    <PreviewBot
      key={`web-preview-${startPreviewAtGroup ?? ''}-${
        startPreviewAtEvent ?? ''
      }`}
      typebot={typebot}
      sessionId={user ? `${typebot.id}-${user.id}` : undefined}
      userId={user?.id}
      startFrom={
        startPreviewAtGroup
          ? { type: 'group', groupId: startPreviewAtGroup }
          : startPreviewAtEvent
          ? { type: 'event', eventId: startPreviewAtEvent }
          : undefined
      }
      onNewInputBlock={(block) =>
        setPreviewingBlock({
          id: block.id,
          groupId:
            typebot.groups.find((g) => g.blocks.some((b) => b.id === block.id))
              ?.id ?? '',
        })
      }
      onNewLogs={handleNewLogs}
      onNewVariables={onNewVariables}
    />
  )
}

type PreviewBotProps = {
  typebot: ComponentProps<typeof Standard>['typebot']
  sessionId?: string
  userId?: string
  startFrom?: ComponentProps<typeof Standard>['startFrom']
  onNewInputBlock: NonNullable<ComponentProps<typeof Standard>['onNewInputBlock']>
  onNewLogs: NonNullable<ComponentProps<typeof Standard>['onNewLogs']>
  onNewVariables?: (variables: DebugVariable[]) => void
}

// Uma instância por execução (remontada via `key` no pai). O ref de "montado"
// vale só para ESTA execução: quando ela é abandonada (restart ou troca de
// grupo), a instância desmonta e um `continueChat` em voo dela não repopula
// mais o painel. No mount, zera as variáveis para não herdar valores da
// execução anterior.
const PreviewBot = ({
  typebot,
  sessionId,
  userId,
  startFrom,
  onNewInputBlock,
  onNewLogs,
  onNewVariables,
}: PreviewBotProps) => {
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    onNewVariables?.([])
    return () => {
      isMounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Standard
      typebot={typebot}
      sessionId={sessionId}
      userId={userId}
      startFrom={startFrom}
      onNewInputBlock={onNewInputBlock}
      onNewLogs={onNewLogs}
      onNewVariables={(variables) => {
        if (isMounted.current) onNewVariables?.(variables)
      }}
      style={{
        borderWidth: '1px',
        borderRadius: '0.25rem',
      }}
    />
  )
}
