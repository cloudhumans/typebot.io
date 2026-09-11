import { describe, it, expect } from 'vitest'
import { TYPEBOT_ERROR_MARKER, firstErrorLog, isFailedRun } from './runVerdict'

const errorLog = {
  status: 'error',
  description: 'Webhook returned an error.',
  details: { status: 500 },
  blockId: 'block-webhook',
}
const infoLog = { status: 'info', description: 'Tool Output' }

describe('isFailedRun', () => {
  it('is false when there is no error log', () => {
    expect(
      isFailedRun({
        result: { logs: [infoLog] },
        output: 'ok',
        hadToolOutput: true,
      })
    ).toBe(false)
  })

  it('is true when an error log exists and there was no Tool Output', () => {
    expect(
      isFailedRun({
        result: { logs: [errorLog] },
        output: '{}',
        hadToolOutput: false,
      })
    ).toBe(true)
  })

  it('is false when an error log exists but a valid Tool Output was produced', () => {
    expect(
      isFailedRun({
        result: { logs: [errorLog, infoLog] },
        output: 'partial but valid',
        hadToolOutput: true,
      })
    ).toBe(false)
  })

  it('is true when the Tool Output carries the transport error marker', () => {
    expect(
      isFailedRun({
        result: { logs: [errorLog, infoLog] },
        output: `${TYPEBOT_ERROR_MARKER} TypeError: fetch failed`,
        hadToolOutput: true,
      })
    ).toBe(true)
  })

  it('is false when there is no error log even without a Tool Output', () => {
    expect(
      isFailedRun({
        result: { logs: [infoLog] },
        output: '{}',
        hadToolOutput: false,
      })
    ).toBe(false)
  })
})

describe('firstErrorLog', () => {
  it('returns the first log with status error', () => {
    expect(firstErrorLog({ logs: [infoLog, errorLog] })).toBe(errorLog)
  })

  it('returns undefined when no log has status error', () => {
    expect(firstErrorLog({ logs: [infoLog] })).toBeUndefined()
    expect(firstErrorLog({})).toBeUndefined()
  })
})
