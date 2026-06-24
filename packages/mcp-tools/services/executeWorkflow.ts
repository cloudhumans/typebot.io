import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import logger from '@typebot.io/lib/logger'

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

  const result = await startChat({
    origin: undefined,
    isOnlyRegistering: false,
    publicId,
    isStreamEnabled: false,
    prefilledVariables,
    textBubbleContentFormat: 'markdown',
    // Trusted, bearer-authed server-to-server call: keep error-status logs that the
    // public filter strips by description (e.g. `webhookErrorDescription` on HTTP
    // 4xx/5xx) so the MCP route can detect failed webhook/upstream runs via
    // `hasErrorLog`. Log details are already secret-masked at push time.
    skipSensitiveLogFiltering: true,
  })

  logger.info('executeWorkflow: completed', { publicId })
  return result
}
