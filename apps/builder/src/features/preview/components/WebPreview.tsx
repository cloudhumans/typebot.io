import { WebhookIcon } from '@/components/icons'
import { useUser } from '@/features/account/hooks/useUser'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useGraph } from '@/features/graph/providers/GraphProvider'
import { useToast } from '@/hooks/useToast'
import { Standard } from '@typebot.io/nextjs'
import { ContinueChatResponse } from '@typebot.io/schemas'
import { DebugVariable } from './DebugVariablesPanel'
import { useEffect, useRef } from 'react'

type Props = {
  onNewVariables?: (variables: DebugVariable[]) => void
}

export const WebPreview = ({ onNewVariables }: Props) => {
  const { user } = useUser()
  const { typebot } = useTypebot()
  const { startPreviewAtGroup, startPreviewAtEvent } = useEditor()
  const { setPreviewingBlock } = useGraph()

  const { showToast } = useToast()

  // Ignora callbacks de execuções abandonadas: ao reiniciar o preview, esta
  // instância é desmontada, mas uma continueChatQuery em voo pode resolver
  // depois e repopular o debug com dados da sessão antiga. O ref barra isso.
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const handleNewVariables = (variables: DebugVariable[]) => {
    if (isMounted.current) onNewVariables?.(variables)
  }

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

  return (
    <Standard
      key={`web-preview${startPreviewAtGroup ?? ''}`}
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
      onNewVariables={handleNewVariables}
      style={{
        borderWidth: '1px',
        borderRadius: '0.25rem',
      }}
    />
  )
}
