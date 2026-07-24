import { WebhookIcon } from '@/components/icons'
import { useUser } from '@/features/account/hooks/useUser'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useGraph } from '@/features/graph/providers/GraphProvider'
import { useToast } from '@/hooks/useToast'
import { Standard } from '@typebot.io/nextjs'
import { ContinueChatResponse } from '@typebot.io/schemas'
import { isInputBlock } from '@typebot.io/schemas/helpers'
import { IntegrationBlockType } from '@typebot.io/schemas/features/blocks/integrations/constants'
import { ComponentProps, useEffect, useRef } from 'react'

// Blocos de integração server-side com resultado observável: mostram o spinner
// durante a execução e o selo verde/vermelho no fim (HTTP request, família
// webhook e Google Sheets).
const EXECUTION_STATUS_BLOCK_TYPES: string[] = [
  IntegrationBlockType.WEBHOOK,
  IntegrationBlockType.ZAPIER,
  IntegrationBlockType.MAKE_COM,
  IntegrationBlockType.PABBLY_CONNECT,
  IntegrationBlockType.GOOGLE_SHEETS,
]

export const WebPreview = () => {
  const { user } = useUser()
  const { typebot } = useTypebot()
  const { startPreviewAtGroup, startPreviewAtEvent } = useEditor()
  const {
    setPreviewingBlock,
    setVisitedEdgeIds,
    setRunningBlockId,
    setBlockResults,
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
      // Resultado por bloco para o selo verde/vermelho: 'error' se houver
      // qualquer log de erro; caso contrário, se o bloco logou algo (info ou
      // success) conta como sucesso — o Sheets "Get row" loga 'info' no
      // sucesso. Erro tem prioridade e persiste.
      if (log.blockId) {
        const blockId = log.blockId
        const status: 'success' | 'error' =
          log.status === 'error' ? 'error' : 'success'
        setBlockResults((prev) =>
          prev[blockId] === 'error' ? prev : { ...prev, [blockId]: status }
        )
      }
    })
  }

  // A partir do input respondido, caminha pelo fluxo (caminho default) até achar
  // o próximo bloco de HTTP request antes do próximo input — é onde o spinner de
  // "executando" deve ficar durante o round-trip (o request roda server-side).
  const findNextRunningBlockId = (
    answeredBlockId: string
  ): string | undefined => {
    if (!typebot) return undefined
    let group = typebot.groups.find((g) =>
      g.blocks.some((b) => b.id === answeredBlockId)
    )
    if (!group) return undefined
    let startIndex =
      group.blocks.findIndex((b) => b.id === answeredBlockId) + 1
    const visitedGroupIds = new Set<string>()
    for (let hop = 0; hop < 60; hop++) {
      if (visitedGroupIds.has(group.id)) return undefined
      visitedGroupIds.add(group.id)
      for (let i = startIndex; i < group.blocks.length; i++) {
        const block = group.blocks[i]
        if (EXECUTION_STATUS_BLOCK_TYPES.includes(block.type)) return block.id
        // Chegou no próximo input: qualquer request depois dele é de outro
        // round-trip, então não é o que está rodando agora.
        if (isInputBlock(block)) return undefined
      }
      const lastBlock = group.blocks[group.blocks.length - 1]
      if (!lastBlock) return undefined
      const outgoingEdge = typebot.edges.find(
        (edge) =>
          'blockId' in edge.from &&
          edge.from.blockId === lastBlock.id &&
          !edge.from.itemId
      )
      if (!outgoingEdge) return undefined
      const nextGroup = typebot.groups.find(
        (g) => g.id === outgoingEdge.to.groupId
      )
      if (!nextGroup) return undefined
      group = nextGroup
      startIndex = outgoingEdge.to.blockId
        ? Math.max(
            0,
            nextGroup.blocks.findIndex((b) => b.id === outgoingEdge.to.blockId)
          )
        : 0
    }
    return undefined
  }

  const resetTrail = () => {
    setVisitedEdgeIds([])
    setRunningBlockId(undefined)
    setBlockResults({})
    setPreviewingBlock(undefined)
  }

  if (!typebot) return null

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
        // Chegou num input: o fluxo parou de processar -> some o spinner.
        setRunningBlockId(undefined)
      }}
      // O usuário respondeu um input: o fluxo processa (server-side) até o
      // próximo input. Coloca o spinner no próximo HTTP request desse trecho.
      onAnswer={({ blockId }) =>
        setRunningBlockId(findNextRunningBlockId(blockId))
      }
      onEnd={() => setRunningBlockId(undefined)}
      onVisitedEdges={(visitedEdgeIds) => setVisitedEdgeIds(visitedEdgeIds)}
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
  resetTrail: () => void
}

// Uma instância por execução (remontada via `key` no restart/troca de grupo).
// No mount limpa o rastro; o ref de "montado" impede que um callback de uma
// execução abandonada (continueChat em voo) repopule o rastro da nova execução.
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
  resetTrail,
}: PreviewBotProps) => {
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    resetTrail()
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
      onNewLogs={onNewLogs}
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
      style={{
        borderWidth: '1px',
        borderRadius: '0.25rem',
      }}
    />
  )
}
