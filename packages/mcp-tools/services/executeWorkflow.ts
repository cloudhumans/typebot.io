import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import { filterPotentiallySensitiveLogs } from '@typebot.io/bot-engine/logs/filterPotentiallySensitiveLogs'
import logger from '@typebot.io/lib/logger'
import { extractToolOutput } from '../helpers/extractToolOutput'
import { hasErrorLog } from '../helpers/hasErrorLog'

/**
 * Marker the typebot webhook engine masks into the response body on a transport
 * failure (e.g. `fetch failed`) — `{"message":"Error from Typebot server: …"}`.
 * MUST stay byte-for-byte identical to claudia-agentic's `TYPEBOT_ERROR_MARKER`
 * (`tracing/langfuse.ts`'s `detectSwallowedToolError`): the `isError` contract
 * below is engineered to match that shim exactly. If you change the wording,
 * change it in both repos or the shim and this gate diverge.
 */
const TYPEBOT_ERROR_MARKER = 'Error from Typebot server:'

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

  // Return logs re-filtered through the public filter so the envelope never
  // carries sensitive logs (e.g. via `extractToolOutput`'s JSON.stringify
  // fallback). This restores the pre-PR envelope behavior on the success path.
  const result = {
    ...rawResult,
    logs: rawResult.logs?.filter(filterPotentiallySensitiveLogs),
  }

  // Extract the agent-facing output once, from the FILTERED result (so the
  // JSON.stringify fallback can't leak secrets), and reuse it for the `isError`
  // verdict. The "Tool Output" log is non-sensitive, so the filter never drops
  // it — `output`/`hadToolOutput` are identical to the raw result.
  const { output, hadToolOutput } = extractToolOutput(result)

  // `isError` contract (matches claudia-agentic's `detectSwallowedToolError`
  // shim exactly — see TYPEBOT_ERROR_MARKER): only flag a run when it produced
  // NO usable answer, OR the "answer" it produced is itself the typebot
  // transport-error marker. A run that errors on a non-fatal path but still
  // emits a valid Tool Output (NocoDB missing field, CNPJ in a CPF block, a
  // Script catching server-side errors, a deliberately-exposed 4xx webhook body)
  // is NOT an error — flagging it would make the MCP adapter throw a
  // ToolException and replace the valid answer with "Please fix your mistakes".
  // The marker arm preserves the PR's original target: a transport failure
  // (`fetch failed`) routed to a "Last HTTP Response" Return Output DOES produce
  // a truthy Tool Output, so `!hadToolOutput` alone would miss it.
  const isError =
    hasErrorLog(rawResult) &&
    (!hadToolOutput || output.includes(TYPEBOT_ERROR_MARKER))

  logger.info('executeWorkflow: completed', { publicId, isError })
  return { result, isError, output }
}
