/**
 * One-time verification script for dd.trace_id injection status.
 *
 * Tests two scenarios:
 *   A) dd-trace initialized BEFORE logger (correct init order — mimics tRPC paths)
 *   B) logger loaded WITHOUT dd-trace init (background job path)
 *
 * Run with: npx tsx packages/lib/scripts/verify-trace-injection.ts
 *
 * Result documents the STATE.md blocker: VAL-03
 */

import { spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const projectRoot = path.resolve(__dirname, '../../..')

// Resolve tsx binary — prefer cli.mjs (works with Node 24+), fall back to shell wrapper
const tsxCandidates = [
  path.join(projectRoot, 'node_modules/.pnpm/tsx@4.7.1/node_modules/tsx/dist/cli.mjs'),
  path.join(projectRoot, 'node_modules/.pnpm/node_modules/.bin/tsx'),
  path.join(projectRoot, 'node_modules/.bin/tsx'),
]
const tsxBin = tsxCandidates.find((p) => fs.existsSync(p))
if (!tsxBin) {
  console.error('tsx binary not found. Tried:', tsxCandidates)
  process.exit(1)
}

const baseEnv = {
  ...process.env,
  DD_LOGS_ENABLED: 'true',
  NODE_ENV: 'production',
}

// Scenario A: dd-trace initialized BEFORE logger (correct init order)
const scriptA = [
  `const { ensureDatadogInitialized } = require('./packages/lib/trpc/datadogInit');`,
  `ensureDatadogInitialized({ logInjection: true });`,
  `const logger = require('./packages/lib/logger').default;`,
  `logger.info('trace probe A');`,
].join(' ')

const resultA = spawnSync(tsxBin, ['-e', scriptA], {
  cwd: projectRoot,
  env: baseEnv,
  encoding: 'utf8',
})

let ddPresentA = false
if (resultA.stdout) {
  try {
    const firstLine = resultA.stdout.trim().split('\n')[0]
    const entry = JSON.parse(firstLine)
    ddPresentA = 'dd' in entry
  } catch {
    // parse failure — treated as absent
  }
}

// Scenario B: logger loaded WITHOUT dd-trace init (background job path)
const scriptB = [
  `const logger = require('./packages/lib/logger').default;`,
  `logger.info('trace probe B');`,
].join(' ')

const resultB = spawnSync(tsxBin, ['-e', scriptB], {
  cwd: projectRoot,
  env: baseEnv,
  encoding: 'utf8',
})

let ddPresentB = false
if (resultB.stdout) {
  try {
    const firstLine = resultB.stdout.trim().split('\n')[0]
    const entry = JSON.parse(firstLine)
    ddPresentB = 'dd' in entry
  } catch {
    // parse failure — treated as absent
  }
}

console.log(`Scenario A (dd-trace before logger): dd key present = ${ddPresentA}`)
console.log(`Scenario B (logger without dd-trace): dd key present = ${ddPresentB}`)

if (resultA.stderr) {
  const stderrA = resultA.stderr.trim()
  if (stderrA) process.stderr.write(`Scenario A stderr:\n${stderrA}\n`)
}
if (resultB.stderr) {
  const stderrB = resultB.stderr.trim()
  if (stderrB) process.stderr.write(`Scenario B stderr:\n${stderrB}\n`)
}
