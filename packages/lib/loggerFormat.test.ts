import { Writable } from 'stream'
import { describe, expect, it } from 'vitest'
import * as winston from 'winston'
import { createLogFormat } from './loggerFormat'

const buildLogger = (pretty: boolean) => {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  const logger = winston.createLogger({
    level: 'info',
    format: createLogFormat(winston, pretty),
    transports: [new winston.transports.Stream({ stream })],
  })
  return { logger, lines }
}

const failure = () => {
  const cause = new Error('connect ECONNREFUSED 10.0.0.1:443')
  const error = new TypeError('fetch failed')
  ;(error as { cause?: unknown }).cause = cause
  return error
}

describe('createLogFormat', () => {
  it('emits error.kind, message and stack in JSON mode', () => {
    const { logger, lines } = buildLogger(false)

    logger.error('MCP request failed', { tenant: 't', error: failure() })

    const entry = JSON.parse(lines[0])
    expect(entry.message).toBe('MCP request failed')
    expect(entry.tenant).toBe('t')
    expect(entry.error.kind).toBe('TypeError')
    expect(entry.error.message).toBe('fetch failed')
    expect(entry.error.stack).toContain(
      'Caused by: Error: connect ECONNREFUSED 10.0.0.1:443'
    )
  })

  it('keeps the error details in pretty mode', () => {
    const { logger, lines } = buildLogger(true)

    logger.error('MCP request failed', { error: failure() })

    expect(lines[0]).toContain('MCP request failed')
    expect(lines[0]).toContain('"kind":"TypeError"')
    expect(lines[0]).toContain('fetch failed')
    expect(lines[0]).toContain('ECONNREFUSED')
  })

  it('keeps a log without an error unchanged in JSON mode', () => {
    const { logger, lines } = buildLogger(false)

    logger.info('Block Executed', { workflow: { name: 'x' } })

    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({
      level: 'info',
      message: 'Block Executed',
      workflow: { name: 'x' },
    })
    expect(entry.error).toBeUndefined()
  })
})
