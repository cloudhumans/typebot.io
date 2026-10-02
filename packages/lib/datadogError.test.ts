import { describe, expect, it, vi } from 'vitest'
import {
  ToolInputError,
  applyDatadogError,
  findError,
  jsonRpcCodeFor,
  logFailureOnce,
  markErrorLogged,
  wasErrorLogged,
} from './datadogError'

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

describe('findError', () => {
  it('returns the first Error among the console arguments', () => {
    const error = new Error('bad')

    expect(findError(['Health check failed', error])).toBe(error)
  })

  it('returns undefined when none of the arguments is an Error', () => {
    expect(findError(['a', 1])).toBeUndefined()
  })
})

describe('ToolInputError', () => {
  it('is an Error named ToolInputError', () => {
    const error = new ToolInputError('Missing required variable "x"')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ToolInputError')
    expect(error.message).toBe('Missing required variable "x"')
  })
})

describe('markErrorLogged / wasErrorLogged', () => {
  it('reports only errors that were marked', () => {
    const marked = new Error('a')
    const other = new Error('a')
    markErrorLogged(marked)

    expect(wasErrorLogged(marked)).toBe(true)
    expect(wasErrorLogged(other)).toBe(false)
  })

  it('ignores primitives', () => {
    markErrorLogged('boom')

    expect(wasErrorLogged('boom')).toBe(false)
    expect(wasErrorLogged(undefined)).toBe(false)
  })
})

describe('logFailureOnce', () => {
  const makeLogger = () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() })

  it('logs a caller error as one warn and no error across the whole chain', () => {
    const log = makeLogger()
    const error = new ToolInputError('Missing required variable "idPedido"')

    logFailureOnce(log, 'Error in startChat', { publicId: 'p' }, error)
    logFailureOnce(log, 'Error in startChat API endpoint', {}, error)
    logFailureOnce(log, 'MCP request failed', {}, error)

    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith('Error in startChat', {
      publicId: 'p',
      error,
    })
  })

  it('keeps the outer context at debug when the error was already logged', () => {
    const log = makeLogger()
    const error = new Error('connect ECONNREFUSED')

    logFailureOnce(log, 'Error in startChat', { publicId: 'p' }, error)
    logFailureOnce(
      log,
      'MCP request failed',
      { tenant: 't', method: 'tools/call', requestId: 7 },
      error
    )

    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.debug).toHaveBeenCalledWith('MCP request failed', {
      tenant: 't',
      method: 'tools/call',
      requestId: 7,
      errorMessage: 'connect ECONNREFUSED',
    })
  })

  it('logs a server failure as one error across the whole chain', () => {
    const log = makeLogger()
    const error = new Error('connect ECONNREFUSED')

    logFailureOnce(log, 'Error in startChat', {}, error)
    logFailureOnce(log, 'Error in startChat API endpoint', {}, error)
    logFailureOnce(log, 'MCP request failed', {}, error)

    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('still logs an error thrown outside startChat', () => {
    const log = makeLogger()

    logFailureOnce(log, 'Error in startChat', {}, new Error('first'))
    logFailureOnce(log, 'MCP request failed', {}, new Error('getWorkflowTools'))

    expect(log.error).toHaveBeenCalledTimes(2)
  })

  it('logs a tRPC client error as warn', () => {
    const log = makeLogger()
    const error = Object.assign(new Error('Typebot not found'), {
      name: 'TRPCError',
      code: 'NOT_FOUND',
    })

    logFailureOnce(log, 'Error in startChat', {}, error)

    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('logs a tRPC timeout as error', () => {
    const log = makeLogger()
    const error = Object.assign(new Error('Chat timed out'), {
      name: 'TRPCError',
      code: 'TIMEOUT',
    })

    logFailureOnce(log, 'Error in startChat', {}, error)

    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('logs a tRPC internal error as error', () => {
    const log = makeLogger()
    const error = Object.assign(new Error('boom'), {
      name: 'TRPCError',
      code: 'INTERNAL_SERVER_ERROR',
    })

    logFailureOnce(log, 'Error in startChat', {}, error)

    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('stringifies non-Error values', () => {
    const log = makeLogger()

    logFailureOnce(log, 'MCP request failed', {}, 'boom')

    expect(log.error).toHaveBeenCalledWith('MCP request failed', {
      error: 'boom',
    })
  })
})

describe('jsonRpcCodeFor', () => {
  it('uses Invalid params for caller errors and Internal error otherwise', () => {
    expect(jsonRpcCodeFor(new ToolInputError('x'))).toBe(-32602)
    expect(jsonRpcCodeFor(new Error('x'))).toBe(-32603)
    expect(jsonRpcCodeFor('x')).toBe(-32603)
  })
})
