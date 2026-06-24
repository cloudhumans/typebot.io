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
})
