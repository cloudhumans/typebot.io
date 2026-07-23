import { describe, it, expect } from 'vitest'
import { formatErrorWithCause } from './formatErrorWithCause'

describe('formatErrorWithCause', () => {
  it('returns the error string when there is no cause', () => {
    expect(formatErrorWithCause(new TypeError('fetch failed'))).toBe(
      'TypeError: fetch failed'
    )
  })

  it('appends a simple cause', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 10.2.3.4:443'),
    })
    expect(formatErrorWithCause(error)).toBe(
      'TypeError: fetch failed (cause: Error: connect ECONNREFUSED 10.2.3.4:443)'
    )
  })

  it('walks a nested cause chain', () => {
    const error = new Error('a', {
      cause: new Error('b', { cause: new Error('c') }),
    })
    expect(formatErrorWithCause(error)).toBe(
      'Error: a (cause: Error: b (cause: Error: c))'
    )
  })

  it('unwraps AggregateError.errors', () => {
    const error = new AggregateError(
      [
        new Error('ECONNREFUSED ::1:443'),
        new Error('ECONNREFUSED 127.0.0.1:443'),
      ],
      'fetch failed'
    )
    expect(formatErrorWithCause(error)).toBe(
      'AggregateError: fetch failed [Error: ECONNREFUSED ::1:443; Error: ECONNREFUSED 127.0.0.1:443]'
    )
  })

  it('stringifies a non-Error cause', () => {
    const error = new Error('boom', { cause: 'plain string reason' })
    expect(formatErrorWithCause(error)).toBe(
      'Error: boom (cause: plain string reason)'
    )
  })

  it('stops on a cyclic cause chain', () => {
    const error = new Error('loop')
    ;(error as { cause?: unknown }).cause = error
    expect(formatErrorWithCause(error)).toBe('Error: loop')
  })

  it('honors the depth limit', () => {
    let current = new Error('leaf')
    for (let i = 0; i < 10; i++)
      current = new Error(`e${i}`, { cause: current })
    const result = formatErrorWithCause(current, 2)
    expect(result.match(/cause:/g)?.length).toBe(2)
  })

  it('falls back to top stack frames when a cause has an empty message', () => {
    // undici's makeNetworkError() creates `new Error(undefined)` — no message,
    // so only the stack identifies which network failure occurred.
    const cause = new Error()
    const error = new TypeError('fetch failed', { cause })
    const result = formatErrorWithCause(error)
    expect(result).toMatch(/^TypeError: fetch failed \(cause: Error \[at /)
    expect(result).toContain('formatErrorWithCause.test.ts')
  })

  it('includes the code of an empty-message cause when present', () => {
    const cause = Object.assign(new Error(), { code: 'UND_ERR_SOCKET' })
    const error = new TypeError('fetch failed', { cause })
    expect(formatErrorWithCause(error)).toContain('[code=UND_ERR_SOCKET]')
  })

  it('keeps just the name when an empty-message cause has no stack', () => {
    const cause = new Error()
    cause.stack = undefined
    const error = new TypeError('fetch failed', { cause })
    expect(formatErrorWithCause(error)).toBe(
      'TypeError: fetch failed (cause: Error)'
    )
  })

  it('does not append stack frames when the cause has a message', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 10.2.3.4:443'),
    })
    expect(formatErrorWithCause(error)).not.toContain('[at ')
  })

  it('does not throw on AggregateErrors nested past the depth limit', () => {
    let current = new AggregateError([new Error('leaf')], 'level 0')
    for (let i = 1; i < 10; i++)
      current = new AggregateError([current], `level ${i}`)
    expect(() => formatErrorWithCause(current)).not.toThrow()
  })
})
