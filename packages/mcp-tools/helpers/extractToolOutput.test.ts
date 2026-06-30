import { vi, describe, it, expect } from 'vitest'
import { extractToolOutput } from './extractToolOutput'

vi.mock('@typebot.io/lib/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('extractToolOutput', () => {
  it('returns the string Tool Output response verbatim, hadToolOutput true', () => {
    const { output, hadToolOutput } = extractToolOutput({
      logs: [
        { description: 'Tool Output', details: { response: 'hello world' } },
      ],
    })

    expect(output).toBe('hello world')
    expect(hadToolOutput).toBe(true)
  })

  it('JSON-stringifies a non-string Tool Output response, hadToolOutput true', () => {
    const { output, hadToolOutput } = extractToolOutput({
      logs: [
        { description: 'Tool Output', details: { response: { ok: true } } },
      ],
    })

    expect(output).toBe(JSON.stringify({ ok: true }))
    expect(hadToolOutput).toBe(true)
  })

  it('falls back to JSON.stringify(result) and hadToolOutput false when no Tool Output log', () => {
    const result = {
      logs: [{ description: 'Webhook returned an error.', details: {} }],
    }
    const { output, hadToolOutput } = extractToolOutput(result)

    expect(output).toBe(JSON.stringify(result))
    expect(hadToolOutput).toBe(false)
  })

  it('treats a Tool Output log with a falsy response as no usable output', () => {
    const result = {
      logs: [{ description: 'Tool Output', details: { response: '' } }],
    }
    const { hadToolOutput } = extractToolOutput(result)

    // Empty/falsy response is skipped — same guard the route relied on.
    expect(hadToolOutput).toBe(false)
  })

  it('returns hadToolOutput false for an empty/missing logs array', () => {
    expect(extractToolOutput({ logs: [] }).hadToolOutput).toBe(false)
    expect(extractToolOutput({}).hadToolOutput).toBe(false)
  })
})
