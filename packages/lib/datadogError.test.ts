import { describe, expect, it } from 'vitest'
import { applyDatadogError, splitErrorArgument } from './datadogError'

describe('applyDatadogError', () => {
  it('maps an Error under `error` into kind, message and stack', () => {
    const error = new TypeError('fetch failed')
    const info = applyDatadogError({ message: 'MCP request failed', error })

    expect(info.error).toEqual({
      kind: 'TypeError',
      message: 'fetch failed',
      stack: error.stack,
    })
  })

  it('maps an Error under `err` and drops the original key', () => {
    const info = applyDatadogError({
      message: 'boom',
      err: new RangeError('out of range'),
    }) as Record<string, any>

    expect(info.err).toBeUndefined()
    expect(info.error.kind).toBe('RangeError')
    expect(info.error.message).toBe('out of range')
  })

  it('appends the cause chain to the stack', () => {
    const root = new Error('connect ECONNREFUSED')
    const wrapper = new Error('startChat failed')
    ;(wrapper as { cause?: unknown }).cause = root
    const info = applyDatadogError({ error: wrapper }) as Record<string, any>

    expect(info.error.kind).toBe('Error')
    expect(info.error.stack).toContain('startChat failed')
    expect(info.error.stack).toContain('Caused by: Error: connect ECONNREFUSED')
  })

  it('keeps a string `error` untouched', () => {
    const info = applyDatadogError({ message: 'x', error: 'plain text' })

    expect(info.error).toBe('plain text')
  })

  it('leaves logs without an error untouched', () => {
    const info = applyDatadogError({ message: 'ok', publicId: 'abc' })

    expect(info).toEqual({ message: 'ok', publicId: 'abc' })
  })
})

describe('splitErrorArgument', () => {
  it('separates the first Error from the other console arguments', () => {
    const error = new Error('bad')
    const { error: found, rest } = splitErrorArgument(['Health check failed', error])

    expect(found).toBe(error)
    expect(rest).toEqual(['Health check failed'])
  })

  it('returns no error when none of the arguments is an Error', () => {
    const { error, rest } = splitErrorArgument(['a', 1])

    expect(error).toBeUndefined()
    expect(rest).toEqual(['a', 1])
  })
})
