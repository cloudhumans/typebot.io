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

describe('logger (production JSON mode)', () => {
  it('should emit valid single-line JSON to stdout (LOG-01)', () => {
    const result = runLoggerScript("logger.info('test message');")
    expect(result).toBeDefined()
    expect(typeof result).toBe('object')
    expect(result.message).toBe('test message')
    expect(result.level).toBe('info')
  })

  it('should include ddsource and service as top-level fields (LOG-02)', () => {
    const result = runLoggerScript("logger.info('static fields test');")
    expect(result.ddsource).toBe('nodejs')
    expect(result.service).toBe('typebot-runner')
  })

  it('should serialize nested metadata as nested JSON keys, not flattened (LOG-04)', () => {
    const result = runLoggerScript(
      "logger.info('nested test', { workflow: { id: 'wf-123', version: '6', execution_id: 'sess-abc' }, typebot_block: { id: 'block-1', type: 'WebhookBlock' } });"
    )
    // Verify workflow is a nested object, not a flat string
    expect(result.workflow).toEqual({
      id: 'wf-123',
      version: '6',
      execution_id: 'sess-abc',
    })
    // Verify typebot_block is a nested object
    expect(result.typebot_block).toEqual({
      id: 'block-1',
      type: 'WebhookBlock',
    })
  })

  it('should include timestamp field in every log entry', () => {
    const result = runLoggerScript("logger.info('timestamp test');")
    expect(result.timestamp).toBeDefined()
    expect(typeof result.timestamp).toBe('string')
  })

  it('should respect DD_SERVICE env var override', () => {
    const result = runLoggerScript("logger.info('service override test');", {
      DD_SERVICE: 'custom-service',
    })
    expect(result.service).toBe('custom-service')
  })
})

// LOG-03 integration note: Full startup-failure verification requires running
// the compiled Next.js app with DD_LOGS_ENABLED=invalid and SKIP_ENV_CHECK=false.
// The Zod schema addition is verified by Plan 01 Task 1's automated check.
// Manual test: DD_LOGS_ENABLED=invalid pnpm --filter @typebot.io/viewer dev
// Expected: startup throws "Invalid environment variables: {\"DD_LOGS_ENABLED\":...}"
