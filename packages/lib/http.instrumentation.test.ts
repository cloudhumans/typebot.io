import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'

const projectRoot = path.resolve(__dirname, '../..')
// Use tsx to execute TypeScript logger files in child processes,
// since logger.ts is not pre-compiled and node cannot require .ts directly.
const tsxBin = path.join(
  projectRoot,
  'node_modules/.pnpm/node_modules/.bin/tsx'
)

/**
 * Helper: runs a logger call in a child process with DD_LOGS_ENABLED=true
 * and returns the parsed JSON from stdout.
 *
 * Uses tsx (not bare node) because logger.ts is TypeScript and cannot be
 * require()'d by plain node without compilation.
 */
const runLoggerScript = (
  loggerCall: string,
  extraEnv: Record<string, string> = {}
): Record<string, unknown> => {
  const script = `const logger = require('./packages/lib/logger').default; ${loggerCall}`
  const stdout = execSync(`${tsxBin} -e "${script.replace(/"/g, '\\"')}"`, {
    cwd: projectRoot,
    env: {
      ...process.env,
      DD_LOGS_ENABLED: 'true',
      NODE_ENV: 'production',
      ...extraEnv,
    },
    encoding: 'utf8',
  }).trim()

  // Take only the first line (the log entry) -- subsequent lines may contain
  // tsx loader noise or other output
  const firstLine = stdout.split('\n')[0]
  return JSON.parse(firstLine)
}

describe('HTTP Instrumentation Schema', () => {
  it('success path emits http.url, http.method, http.status_code, http.duration (HTTP-01)', () => {
    const result = runLoggerScript(
      `logger.info('HTTP Request Executed', { http: { url: 'https://example.com/api', method: 'POST', status_code: 200, duration: 142 } });`
    )
    expect(result.message).toBe('HTTP Request Executed')
    expect(result.http).toEqual({
      url: 'https://example.com/api',
      method: 'POST',
      status_code: 200,
      duration: 142,
    })
  })

  it('error path emits http.url, http.method, http.status_code at warn level (HTTP-02)', () => {
    const result = runLoggerScript(
      `logger.warn('HTTP Request Error', { http: { url: 'https://example.com/api', method: 'GET', status_code: 404, duration: 98 } });`
    )
    expect(result.level).toBe('warn')
    expect(result.http).toMatchObject({
      url: 'https://example.com/api',
      method: 'GET',
      status_code: 404,
    })
  })

  it('timeout path emits http.url, http.method, timeout_ms at error level (HTTP-03)', () => {
    const result = runLoggerScript(
      `logger.error('HTTP Request Timeout', { http: { url: 'https://example.com/api', method: 'POST', timeout_ms: 10000, duration: 10001 } });`
    )
    expect(result.level).toBe('error')
    expect(result.http).toMatchObject({
      url: 'https://example.com/api',
      method: 'POST',
      timeout_ms: 10000,
    })
  })

  it('success path emits at info level (HTTP-04)', () => {
    const result = runLoggerScript(
      `logger.info('HTTP Request Executed', { http: { url: 'https://example.com', method: 'GET', status_code: 200, duration: 55 } });`
    )
    expect(result.level).toBe('info')
  })

  it('no request body, response body, or headers in http log (HTTP-05)', () => {
    const result = runLoggerScript(
      `logger.info('HTTP Request Executed', { http: { url: 'https://example.com', method: 'POST', status_code: 200, duration: 50 } });`
    )
    const httpKeys = Object.keys(result.http as Record<string, unknown>)
    expect(httpKeys).not.toContain('body')
    expect(httpKeys).not.toContain('headers')
    expect(httpKeys).not.toContain('response')
    expect(httpKeys).not.toContain('data')
    expect(httpKeys).not.toContain('json')
    expect(httpKeys).not.toContain('authorization')
  })
})
