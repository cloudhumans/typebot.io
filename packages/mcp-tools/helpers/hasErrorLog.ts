/**
 * True when a workflow execution result carries at least one error-status log.
 *
 * Webhook / upstream failures inside a tool typebot do NOT throw — the engine
 * records them as a log entry with `status: 'error'` (see
 * `bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`) and the flow
 * continues, embedding e.g. `"Error from Typebot server: TypeError: fetch
 * failed"` in the result text. Without this signal the MCP route would return
 * such a failure as a successful `CallToolResult` (no `isError`), so the calling
 * agent treats the embedded error as a normal answer. The route uses this to set
 * `isError: true` instead.
 *
 * NOTE: this relies on the MCP path calling `startChat` with
 * `skipSensitiveLogFiltering: true`. The public log filter
 * (`filterPotentiallySensitiveLogs`) drops entries by description — including
 * `webhookErrorDescription` ("Webhook returned an error.") emitted on HTTP
 * 4xx/5xx responses — so without bypassing it those failures would never reach
 * this check and `isError` would stay unset.
 */
export function hasErrorLog(result: {
  logs?: Array<{ status?: string }>
}): boolean {
  return (
    Array.isArray(result.logs) &&
    result.logs.some((log) => log?.status === 'error')
  )
}
