import { describe, it, expect } from 'vitest'
import { execSync, spawnSync } from 'child_process'
import path from 'path'

const projectRoot = path.resolve(__dirname, '../..')
const tsxBin = path.join(
  projectRoot,
  'node_modules/.pnpm/node_modules/.bin/tsx'
)

/**
 * Helper: runs a logger call in a child process with DD_LOGS_ENABLED=true
 * and returns the parsed JSON from stdout.
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

  const firstLine = stdout.split('\n')[0]
  return JSON.parse(firstLine)
}

// DD pipeline schema fixture
const DD_SCHEMA = {
  topLevel: ['message', 'level', 'timestamp', 'ddsource', 'service'],
  ddsource: 'nodejs',
  service: 'typebot-runner',
  workflowFields: { id: 'string', version: 'string', execution_id: 'string' },
  typebotBlockFields: { id: 'string', type: 'string' },
  httpSuccessFields: { url: 'string', method: 'string', status_code: 'number', duration: 'number' },
  httpTimeoutFields: { url: 'string', method: 'string', timeout_ms: 'number', duration: 'number' },
}

describe('DD Pipeline Schema Fixture (VAL-01)', () => {
  it('"Block Executed" log matches DD pipeline schema', () => {
    const result = runLoggerScript(
      "logger.info('Block Executed', { workflow: { id: 'wf-1', version: '2', execution_id: 'sess-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });"
    )

    // Top-level fields present
    for (const field of DD_SCHEMA.topLevel) {
      expect(result[field]).toBeDefined()
    }

    // Static DD fields
    expect(result.ddsource).toBe(DD_SCHEMA.ddsource)
    expect(result.service).toBe(DD_SCHEMA.service)
    expect(result.level).toBe('info')
    expect(result.message).toBe('Block Executed')

    // workflow is nested object (not string), with correct field types
    expect(typeof result.workflow).toBe('object')
    expect(result.workflow).not.toBeNull()
    const wf = result.workflow as Record<string, unknown>
    expect(typeof wf.id).toBe('string')
    expect(typeof wf.version).toBe('string')
    expect(typeof wf.execution_id).toBe('string')

    // typebot_block is nested object with correct field types
    expect(typeof result.typebot_block).toBe('object')
    expect(result.typebot_block).not.toBeNull()
    const tb = result.typebot_block as Record<string, unknown>
    expect(typeof tb.id).toBe('string')
    expect(typeof tb.type).toBe('string')
  })

  it('"HTTP Request Executed" log matches DD pipeline schema', () => {
    const result = runLoggerScript(
      "logger.info('HTTP Request Executed', { http: { url: 'https://example.com', method: 'POST', status_code: 200, duration: 123 } });"
    )

    expect(result.level).toBe('info')
    expect(result.message).toBe('HTTP Request Executed')
    expect(result.ddsource).toBe(DD_SCHEMA.ddsource)
    expect(result.service).toBe(DD_SCHEMA.service)

    // http is nested object with correct field types
    expect(typeof result.http).toBe('object')
    expect(result.http).not.toBeNull()
    const http = result.http as Record<string, unknown>
    expect(typeof http.url).toBe('string')
    expect(typeof http.method).toBe('string')
    expect(typeof http.status_code).toBe('number')
    expect(typeof http.duration).toBe('number')
  })

  it('"HTTP Request Error" log matches DD pipeline schema', () => {
    const result = runLoggerScript(
      "logger.warn('HTTP Request Error', { http: { url: 'https://example.com', method: 'GET', status_code: 404, duration: 55 } });"
    )

    expect(result.level).toBe('warn')
    expect(result.message).toBe('HTTP Request Error')

    expect(typeof result.http).toBe('object')
    expect(result.http).not.toBeNull()
    const http = result.http as Record<string, unknown>
    expect(typeof http.status_code).toBe('number')
  })

  it('"HTTP Request Timeout" log matches DD pipeline schema (no synthetic 408)', () => {
    const result = runLoggerScript(
      "logger.error('HTTP Request Timeout', { http: { url: 'https://example.com', method: 'POST', timeout_ms: 5000, duration: 5001 } });"
    )

    expect(result.level).toBe('error')
    expect(result.message).toBe('HTTP Request Timeout')

    expect(typeof result.http).toBe('object')
    expect(result.http).not.toBeNull()
    const http = result.http as Record<string, unknown>
    expect(typeof http.timeout_ms).toBe('number')
    // No synthetic 408 status_code
    expect(http.status_code).toBeUndefined()
  })

  it('"HTTP Request Failed" log matches DD pipeline schema (error is string)', () => {
    const result = runLoggerScript(
      "logger.error('HTTP Request Failed', { http: { url: 'https://example.com', method: 'POST', duration: 12 }, error: 'Network error' });"
    )

    expect(result.level).toBe('error')
    expect(result.message).toBe('HTTP Request Failed')

    // error field is string (not raw Error object)
    expect(typeof result.error).toBe('string')
  })
})

describe('Performance Benchmark (VAL-02)', () => {
  it('20 logger.info calls with block payloads complete in < 50ms total', () => {
    const script = `
const logger = require('./packages/lib/logger').default;
const { performance } = require('perf_hooks');
const payload = { workflow: { id: 'wf-bench', version: '2', execution_id: 'sess-bench' }, typebot_block: { id: 'b-bench', type: 'webhook' } };
const t0 = performance.now();
for (let i = 0; i < 20; i++) logger.info('Block Executed', payload);
const elapsed = performance.now() - t0;
process.stderr.write('ELAPSED:' + elapsed.toFixed(3));
`

    const result = spawnSync(tsxBin, ['-e', script], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DD_LOGS_ENABLED: 'true',
        NODE_ENV: 'production',
      },
      encoding: 'utf8',
    })

    const match = result.stderr.match(/ELAPSED:(\d+\.\d+)/)
    expect(match).not.toBeNull()
    const elapsedMs = parseFloat(match![1])
    expect(elapsedMs).toBeLessThan(50)
  })
})
