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
    setJumpTargetGroupIds,
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
    const groupOf = (blockId: string) =>
      typebot.groups.find((g) => g.blocks.some((b) => b.id === blockId))
    // Edges que saem de um bloco — pode ser a default (sem itemId) OU de item
    // (Buttons/Choice/Condition). Seguimos a edge de fato tomada quando é única.
    const edgesFrom = (blockId: string) =>
      typebot.edges.filter(
        (edge) => 'blockId' in edge.from && edge.from.blockId === blockId
      )
    const entryIndex = (group: (typeof typebot.groups)[number], blockId?: string) =>
      blockId ? Math.max(0, group.blocks.findIndex((b) => b.id === blockId)) : 0

    // Resolve para onde o fluxo vai a partir do input respondido: se o bloco tem
    // exatamente uma edge de saída, segue por ela (mesmo de item); se tem várias
    // (ramificação), não dá pra saber o caminho no cliente durante o round-trip
    // server-side, então não arrisca (sem spinner). Sem edge própria, continua
    // no mesmo grupo, no bloco seguinte.
    const answeredGroup = groupOf(answeredBlockId)
    if (!answeredGroup) return undefined
    const answeredEdges = edgesFrom(answeredBlockId)
    if (answeredEdges.length > 1) return undefined
    let group: (typeof typebot.groups)[number] | undefined
    let index: number
    if (answeredEdges.length === 1) {
      group = groupOf(answeredEdges[0].to.groupId)
      index = group ? entryIndex(group, answeredEdges[0].to.blockId) : 0
    } else {
      group = answeredGroup
      index = answeredGroup.blocks.findIndex((b) => b.id === answeredBlockId) + 1
    }

    const visitedGroupIds = new Set<string>()
    for (let hop = 0; hop < 100; hop++) {
      if (!group || visitedGroupIds.has(group.id)) return undefined
      visitedGroupIds.add(group.id)
      let advanced = false
      for (let i = index; i < group.blocks.length; i++) {
        const block = group.blocks[i]
        if (EXECUTION_STATUS_BLOCK_TYPES.includes(block.type)) return block.id
        // Próximo input: o que roda depois é de outro round-trip.
        if (isInputBlock(block)) return undefined
        const outgoing = edgesFrom(block.id)
        if (outgoing.length === 0) continue // segue no mesmo grupo
        if (outgoing.length > 1) return undefined // ramificação -> desconhecido
        const nextGroup = groupOf(outgoing[0].to.groupId)
        if (!nextGroup) return undefined
        group = nextGroup
        index = entryIndex(nextGroup, outgoing[0].to.blockId)
        advanced = true
        break
      }
      if (!advanced) return undefined // fim do grupo sem redirecionar
    }
    return undefined
  }

  const resetTrail = () => {
    setVisitedEdgeIds([])
    setRunningBlockId(undefined)
    setBlockResults({})
    setJumpTargetGroupIds([])
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
      onJumps={(jumpTargetGroupIds) =>
        setJumpTargetGroupIds(jumpTargetGroupIds)
      }
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
  onJumps: (jumpTargetGroupIds: string[]) => void
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
  onJumps,
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
      onJumps={(jumpTargetGroupIds) => {
        if (isMounted.current) onJumps(jumpTargetGroupIds)
      }}
      style={{
        borderWidth: '1px',
        borderRadius: '0.25rem',
      }}
    />
  )
}
