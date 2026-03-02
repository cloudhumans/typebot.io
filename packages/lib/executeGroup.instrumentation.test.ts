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

describe('Block Instrumentation Schema', () => {
  it('emits message prefixed with workspace name (UAT-01)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect(result.message).toMatch(/ - Block Executed$/)
    expect(result.message).toContain('TestWorkspace')
  })

  it('emits workspace.id and workspace.name (UAT-04)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-abc', name: 'My Flow', version_id: '2', execution_id: 'sess-xyz', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect(result.workspace).toEqual({ id: 'ws-1', name: 'TestWorkspace' })
  })

  it('emits workflow.name and workflow.version_id (UAT-02, UAT-03)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-abc', name: 'My Flow', version_id: '2', execution_id: 'sess-xyz', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect(result.workflow).toEqual({
      id: 'wf-abc',
      name: 'My Flow',
      version_id: '2',
      execution_id: 'sess-xyz',
      version_typebot_history_id: 'hist-1',
    })
  })

  it('emits typebot_block.id and typebot_block.type as nested object (BLOCK-02)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'block-id-123', type: 'condition' } });`
    )
    expect(result.typebot_block).toEqual({
      id: 'block-id-123',
      type: 'condition',
    })
  })

  it('includes static DD pipeline fields from defaultMeta', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect(result.ddsource).toBe('nodejs')
    expect(result.service).toBe('typebot-runner')
  })

  it('workflow.version_id is emitted as string, not number (UAT-03)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'hist-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect(typeof (result.workflow as any).version_id).toBe('string')
  })

  it('emits workflow.version_typebot_history_id (HIST-01)', () => {
    const result = runLoggerScript(
      `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'clxyz123abc' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
    )
    expect((result.workflow as any).version_typebot_history_id).toBe('clxyz123abc')
  })
})
