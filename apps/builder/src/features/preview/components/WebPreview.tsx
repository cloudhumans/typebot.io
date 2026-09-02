import { WebhookIcon } from '@/components/icons'
import { useUser } from '@/features/account/hooks/useUser'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useGraph } from '@/features/graph/providers/GraphProvider'
import { useToast } from '@/hooks/useToast'
import { Standard } from '@typebot.io/nextjs'
import { ContinueChatResponse, PreviewJump } from '@typebot.io/schemas'
import { DebugVariable } from './DebugVariablesPanel'
import { findNextRunningBlockId } from '../helpers/findNextRunningBlockId'
import { computeExecutionTrail } from '../helpers/computeExecutionTrail'
import { computeJumpTrail } from '../helpers/computeJumpTrail'
import {
  createEmptyExecutionTrail,
  createEmptyJumpTrail,
} from '@/features/graph/types'
import { ComponentProps, useEffect, useRef } from 'react'

type Props = {
  onNewVariables?: (variables: DebugVariable[]) => void
}

export const WebPreview = ({ onNewVariables }: Props) => {
  const { user } = useUser()
  const { typebot } = useTypebot()
  const { startPreviewAtGroup, startPreviewAtEvent } = useEditor()
  const {
    setPreviewingBlock,
    setExecutionTrail,
    setRunningBlockId,
    setBlockResults,
    setJumpTrail,
  } = useGraph()

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
      // Per-block result for the green/red badge: 'error' if there is any error
      // log; otherwise a block that logged anything (info or success) counts as
      // a success — Sheets "Get row" logs 'info' on success. Errors take
      // priority and stick.
      if (log.blockId) {
        const blockId = log.blockId
        const status: 'success' | 'error' =
          log.status === 'error' ? 'error' : 'success'
        setBlockResults((prev) =>
          prev[blockId] === 'error' ? prev : { ...prev, [blockId]: status }
        )
      }
    })
    // A failing `continueChat` only emits an error log — it returns before
    // `onNewInputBlock`/`onEnd`, which are what normally clear the spinner.
    // Without this the "running" indicator stays stuck until the preview is
    // restarted.
    if (logs?.some((log) => log.status === 'error'))
      setRunningBlockId(undefined)
  }

  const resetTrail = () => {
    setExecutionTrail(createEmptyExecutionTrail())
    setRunningBlockId(undefined)
    setBlockResults({})
    setJumpTrail(createEmptyJumpTrail())
    setPreviewingBlock(undefined)
  }

  if (!typebot) return null

  // `key` amarra a identidade da execução (typebot + grupo/evento de início).
  // Quando muda, o PreviewBot remonta — o que invalida o guard da execução
  // anterior e limpa o painel de variáveis e a trilha de execução, tanto no
  // restart quanto ao dar play num grupo/evento específico.
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
      onNewLogs={handleNewLogs}
      onNewInputBlock={(block) => {
        setPreviewingBlock({
          id: block.id,
          groupId:
            typebot.groups.find((g) => g.blocks.some((b) => b.id === block.id))
              ?.id ?? '',
        })
        // Reached an input: the flow stopped processing -> hide the spinner.
        setRunningBlockId(undefined)
      }}
      // The user answered an input: the flow processes (server-side) until the
      // next input. Put the spinner on the next HTTP request in that stretch.
      onAnswer={({ blockId }) =>
        setRunningBlockId(
          findNextRunningBlockId({ typebot, answeredBlockId: blockId })
        )
      }
      onEnd={() => setRunningBlockId(undefined)}
      // Reduce the cumulative visited-edge list to lookups once, here, instead
      // of letting every edge and group scan it on every render.
      onVisitedEdges={(visitedEdgeIds) =>
        setExecutionTrail(
          computeExecutionTrail({ visitedEdgeIds, edges: typebot.edges })
        )
      }
      // Same idea as the edge trail: reduce the cumulative jump list to lookups
      // here, once, instead of in every block and every group on every render.
      onJumps={(jumps) => setJumpTrail(computeJumpTrail(jumps))}
      onNewVariables={onNewVariables}
      resetTrail={resetTrail}
    />
  )
}

type PreviewBotProps = {
  typebot: ComponentProps<typeof Standard>['typebot']
  sessionId?: string
  userId?: string
  startFrom?: ComponentProps<typeof Standard>['startFrom']
  onNewLogs: NonNullable<ComponentProps<typeof Standard>['onNewLogs']>
  onNewInputBlock: NonNullable<
    ComponentProps<typeof Standard>['onNewInputBlock']
  >
  onAnswer: NonNullable<ComponentProps<typeof Standard>['onAnswer']>
  onEnd: NonNullable<ComponentProps<typeof Standard>['onEnd']>
  onVisitedEdges: (visitedEdgeIds: string[]) => void
  onJumps: (jumps: PreviewJump[]) => void
  onNewVariables?: (variables: DebugVariable[]) => void
  resetTrail: () => void
}

// One instance per run (remounted through `key` on restart / group change). It
// clears the trail and the variables panel on mount; the "mounted" ref keeps a
// callback from an abandoned run (an in-flight continueChat) from repopulating
// the new trail or panel.
const PreviewBot = ({
  typebot,
  sessionId,
  userId,
  startFrom,
  onNewLogs,
  onNewInputBlock,
  onAnswer,
  onEnd,
  onVisitedEdges,
  onJumps,
  onNewVariables,
  resetTrail,
}: PreviewBotProps) => {
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    resetTrail()
    onNewVariables?.([])
    return () => {
      isMounted.current = false
      resetTrail()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Standard
      typebot={typebot}
      sessionId={sessionId}
      userId={userId}
      startFrom={startFrom}
      onNewLogs={(logs) => {
        if (isMounted.current) onNewLogs(logs)
      }}
      onNewInputBlock={(block) => {
        if (isMounted.current) onNewInputBlock(block)
      }}
      onAnswer={(answer) => {
        if (isMounted.current) onAnswer(answer)
      }}
      onEnd={() => {
        if (isMounted.current) onEnd()
      }}
      onVisitedEdges={(visitedEdgeIds) => {
        if (isMounted.current) onVisitedEdges(visitedEdgeIds)
      }}
      onJumps={(jumps) => {
        if (isMounted.current) onJumps(jumps)
      }}
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
