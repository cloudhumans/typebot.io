import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import logger from '@typebot.io/lib/logger'
import { hasErrorLog } from '../helpers/hasErrorLog'

interface ExecuteWorkflowParams {
  publicId: string
  prefilledVariables?: Record<string, unknown>
}

/**
 * Execute a workflow typebot with prefilled variables. Wraps `startChat` for
 * MCP usage and derives the run's failure verdict here (the one MCP-owned place
 * that knows it), so the route maps a typed `isError` onto the envelope instead
 * of reaching into `logs[].status` itself. See `hasErrorLog` for why this needs
 * the unfiltered logs.
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

  const result = await startChat({
    origin: undefined,
    isOnlyRegistering: false,
    publicId,
    isStreamEnabled: false,
    prefilledVariables,
    textBubbleContentFormat: 'markdown',
    // Trusted, bearer-authed call: keep the error-status logs the public filter
    // strips by description, so `hasErrorLog` can see failed webhook/upstream
    // runs. Details are already secret-masked at push time. (see hasErrorLog)
    skipSensitiveLogFiltering: true,
  })

  const isError = hasErrorLog(result)
  logger.info('executeWorkflow: completed', { publicId, isError })
  return { result, isError }
}
