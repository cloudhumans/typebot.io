import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import { filterPotentiallySensitiveLogs } from '@typebot.io/bot-engine/logs/filterPotentiallySensitiveLogs'
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
 * of reaching into `logs[].status` itself.
 *
 * We ask `startChat` for the UNFILTERED logs (`skipSensitiveLogFiltering: true`)
 * because the public filter drops webhook/sendEmail error logs by description, so
 * `hasErrorLog` would otherwise never see a failed upstream run (see
 * `hasErrorLog`). But those raw logs can carry secrets — e.g. the sendEmail
 * `!emailBody` branch logs `transportConfig.auth.pass` UNMASKED — and
 * `extractToolOutput` falls back to `JSON.stringify(result)` when no "Tool
 * Output" log is present (exactly the failure case). So we derive `isError` from
 * the raw logs and then return a `result` whose logs are re-filtered through the
 * SAME public filter, keeping the envelope free of sensitive logs.
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

  const rawResult = await startChat({
    origin: undefined,
    isOnlyRegistering: false,
    publicId,
    isStreamEnabled: false,
    prefilledVariables,
    textBubbleContentFormat: 'markdown',
    // Trusted, bearer-authed call: keep the error-status logs the public filter
    // strips by description, so `hasErrorLog` can see failed webhook/upstream
    // runs. These raw logs may contain secrets, so we re-filter them out of the
    // returned `result` below. (see hasErrorLog)
    skipSensitiveLogFiltering: true,
  })

  // Verdict from the UNFILTERED logs (must see webhook/sendEmail error entries).
  const isError = hasErrorLog(rawResult)

  // Return logs re-filtered through the public filter so the envelope never
  // carries sensitive logs (e.g. via `extractToolOutput`'s JSON.stringify
  // fallback). This restores the pre-PR envelope behavior on the success path.
  const result = {
    ...rawResult,
    logs: rawResult.logs?.filter(filterPotentiallySensitiveLogs),
  }

  logger.info('executeWorkflow: completed', { publicId, isError })
  return { result, isError }
}
