import logger from '@typebot.io/lib/logger'

export interface ExtractedToolOutput {
  /** Text returned to the MCP client as the tool result. */
  output: string
  /**
   * True when the run produced a usable "Tool Output" log (truthy
   * `details.response`), i.e. we did NOT fall back to `JSON.stringify(result)`.
   * Callers use this to tell "tool ran and answered" apart from "tool produced
   * no answer" — the latter is the only no-output case and feeds the `isError`
   * verdict in `executeWorkflow`. Returning it from the SAME pass that extracts
   * `output` keeps the two in lockstep (no second scan that could drift).
   */
  hadToolOutput: boolean
}

/**
 * Extract clean output from workflow execution result.
 * Looks for "Tool Output" log entry, falls back to full JSON.
 */
export function extractToolOutput(result: {
  logs?: Array<{
    description?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any
  }>
}): ExtractedToolOutput {
  if (Array.isArray(result.logs)) {
    for (const log of result.logs) {
      if (log.description === 'Tool Output' && log.details?.response) {
        logger.debug('extractToolOutput: found Tool Output log')
        return {
          output:
            typeof log.details.response === 'string'
              ? log.details.response
              : JSON.stringify(log.details.response),
          hadToolOutput: true,
        }
      }
    }
  }
  logger.warn(
    'extractToolOutput: Tool Output log not found, returning full result',
    {
      logCount: result.logs?.length ?? 0,
    }
  )
  return { output: JSON.stringify(result), hadToolOutput: false }
}
