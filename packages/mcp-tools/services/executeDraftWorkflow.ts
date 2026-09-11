import { startChatPreview } from '@typebot.io/bot-engine/apiHandlers/startChatPreview'
import type {
  DraftRunError,
  DraftRunResult,
  StartTypebot,
} from '@typebot.io/schemas'
import logger from '@typebot.io/lib/logger'
import { extractToolOutput } from '../helpers/extractToolOutput'
import { findBlockType } from '../helpers/findBlockType'
import { firstErrorLog, isFailedRun } from '../helpers/runVerdict'

interface ExecuteDraftWorkflowParams {
  typebot: StartTypebot
  userId: string
  prefilledVariables?: Record<string, unknown>
}

type PreviewResult = Awaited<ReturnType<typeof startChatPreview>>

const errorFromLog = (
  typebot: StartTypebot,
  log: { description: string; blockId?: string; details?: unknown }
) => ({
  message: log.description,
  blockId: log.blockId,
  blockType: findBlockType(typebot, log.blockId),
  details: log.details,
})

const engineThrew = (message: string): DraftRunResult => ({
  status: 'error',
  output: null,
  error: { message },
  logs: [],
  trail: [],
  variables: [],
})

export async function executeDraftWorkflow({
  typebot,
  userId,
  prefilledVariables,
}: ExecuteDraftWorkflowParams): Promise<DraftRunResult> {
  logger.info('executeDraftWorkflow: starting', {
    typebotId: typebot.id,
    variableCount: prefilledVariables
      ? Object.keys(prefilledVariables).length
      : 0,
  })

  let result: PreviewResult
  try {
    result = await startChatPreview({
      typebotId: typebot.id,
      typebot,
      userId,
      prefilledVariables,
      headless: true,
      isOnlyRegistering: false,
      isStreamEnabled: false,
      textBubbleContentFormat: 'markdown',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.info('executeDraftWorkflow: engine threw', {
      typebotId: typebot.id,
      message,
    })
    return engineThrew(message)
  }

  const logs = result.logs ?? []
  const trail = result.visitedEdgeIds ?? []
  const variables = result.variables ?? []
  const { output, hadToolOutput } = extractToolOutput(result)

  if (result.input) {
    return {
      status: 'paused',
      output: hadToolOutput ? output : null,
      error: {
        message: `Flow paused at input block "${result.input.type}" (${result.input.id}). Headless flows (TOOL and CONTEXT_ENRICHMENT) must not contain input blocks.`,
        blockId: result.input.id,
        blockType: result.input.type,
      },
      logs,
      trail,
      variables,
    }
  }

  const clientAction = result.clientSideActions?.find(
    (action) => action.expectsDedicatedReply
  )
  if (clientAction) {
    return {
      status: 'paused',
      output: hadToolOutput ? output : null,
      error: {
        message: `Flow paused at a client-side action (block ${
          clientAction.lastBubbleBlockId ?? 'unknown'
        }) that needs a browser to answer. Headless flows (TOOL and CONTEXT_ENRICHMENT) must not use client-side Script or Set Variable blocks.`,
        blockId: clientAction.lastBubbleBlockId,
        blockType: findBlockType(typebot, clientAction.lastBubbleBlockId),
      },
      logs,
      trail,
      variables,
    }
  }

  const failed = isFailedRun({ result, output, hadToolOutput })

  if (hadToolOutput && !failed) {
    logger.info('executeDraftWorkflow: completed', {
      typebotId: typebot.id,
      status: 'success',
    })
    const warningLog = firstErrorLog(result)
    return {
      status: 'success',
      output,
      error: warningLog ? errorFromLog(typebot, warningLog) : null,
      logs,
      trail,
      variables,
    }
  }

  const errorLog = firstErrorLog(result)
  const error: DraftRunError = errorLog
    ? errorFromLog(typebot, errorLog)
    : {
        message:
          'Flow ended without a "Tool Output" log. Add an End Workflow block (action "Return Output") so the tool returns a result.',
      }

  logger.info('executeDraftWorkflow: completed', {
    typebotId: typebot.id,
    status: 'error',
    blockId: error.blockId ?? null,
  })

  return {
    status: 'error',
    output: hadToolOutput ? output : null,
    error,
    logs,
    trail,
    variables,
  }
}
