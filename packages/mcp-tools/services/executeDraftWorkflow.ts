import { startChatPreview } from '@typebot.io/bot-engine/apiHandlers/startChatPreview'
import type { DraftRunResult, StartTypebot } from '@typebot.io/schemas'
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

  const failed = isFailedRun({ result, output, hadToolOutput })

  if (hadToolOutput && !failed) {
    logger.info('executeDraftWorkflow: completed', {
      typebotId: typebot.id,
      status: 'success',
    })
    return { status: 'success', output, error: null, logs, trail, variables }
  }

  const errorLog = firstErrorLog(result)
  const error = errorLog
    ? {
        message: errorLog.description,
        blockId: errorLog.blockId,
        blockType: findBlockType(typebot, errorLog.blockId),
        details: errorLog.details,
      }
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
