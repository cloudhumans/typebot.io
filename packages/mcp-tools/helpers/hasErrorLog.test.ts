import { describe, it, expect } from 'vitest'
import { hasErrorLog } from './hasErrorLog'

describe('hasErrorLog', () => {
  it('returns true when any log has status "error"', () => {
    expect(
      hasErrorLog({
        logs: [
          { status: 'success', description: 'ok' },
          { status: 'error', description: 'Webhook failed to execute.' },
        ],
      })
    ).toBe(true)
  })

  it('returns false when all logs are non-error', () => {
    expect(
      hasErrorLog({
        logs: [
          { status: 'success', description: 'ok' },
          { status: 'info', description: 'something' },
        ],
      })
    ).toBe(false)
  })

  it('returns false when there are no logs', () => {
    expect(hasErrorLog({ logs: [] })).toBe(false)
    expect(hasErrorLog({})).toBe(false)
  })

  it('tolerates malformed log entries', () => {
    expect(
      hasErrorLog({ logs: [undefined as never, { status: 'error' }] })
    ).toBe(true)
    expect(hasErrorLog({ logs: [undefined as never] })).toBe(false)
  })

  // Regression: these error logs are emitted on HTTP 4xx/5xx webhook responses
  // (`webhookErrorDescription`) and on thrown fetches (`Webhook failed to
  // execute.`). The public log filter strips the former by description, so the
  // MCP path must call startChat with skipSensitiveLogFiltering:true for them to
  // reach hasErrorLog. Given unfiltered logs, both must be detected.
  it('detects an HTTP 4xx/5xx webhook error log (Webhook returned an error.)', () => {
    expect(
      hasErrorLog({
        logs: [
          { status: 'error', description: 'Webhook returned an error.' },
        ],
      })
    ).toBe(true)
  })

  it('detects a thrown-fetch webhook error log (Webhook failed to execute.)', () => {
    expect(
      hasErrorLog({
        logs: [{ status: 'error', description: 'Webhook failed to execute.' }],
      })
    ).toBe(true)
  })
})
