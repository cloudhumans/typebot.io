import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import logger from '@/helpers/logger'

interface ExecuteWorkflowParams {
  publicId: string
  prefilledVariables?: Record<string, unknown>
}

/**
 * Execute a workflow typebot with prefilled variables.
 * Wraps the startChat function for MCP usage.
 */
export async function executeWorkflow({
  publicId,
  prefilledVariables,
}: ExecuteWorkflowParams) {
  logger.info('executeWorkflow: starting', {
    publicId,
    variableCount: prefilledVariables
      ? Object.keys(prefilledVariables).length
      : 0,
  })

  try {
    const result = await startChat({
      origin: undefined,
      isOnlyRegistering: false,
      publicId,
      isStreamEnabled: false,
      prefilledVariables,
      textBubbleContentFormat: 'markdown',
    })

    logger.info('executeWorkflow: completed', { publicId })
    return result
  } catch (error) {
    logger.error('executeWorkflow: failed', {
      publicId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}
