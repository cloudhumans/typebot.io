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
})
