// Node-only dynamic access to tracer to avoid bundling dd-trace into client code.
import { initDatadog, isDatadogReady } from './datadogCore'

export interface DatadogInitOptions {
  service?: string
  env?: string
  version?: string
  logInjection?: boolean
  // Allow disabling entirely (e.g., tests)
  enabled?: boolean
}

/**
 * Ensures Datadog tracer is initialized exactly once (idempotent) on the server.
 * Should be called as early as possible (instrumentation.ts) to maximize auto‑instrumentation coverage.
 */
let didInit = false

/**
 * Idempotent Datadog tracer init. Safe on repeated calls.
 * Returns true only on first successful init.
 */
export function ensureDatadogInitialized(
  opts: DatadogInitOptions = {}
): boolean {
  if (didInit) return false
  if (typeof window !== 'undefined') return false
  if (process.env.NEXT_RUNTIME === 'edge') return false
  if (opts.enabled === false) return false
  const newly = initDatadog({
    service: opts.service,
    env: opts.env,
    version: opts.version,
    logInjection: opts.logInjection,
    enabled: opts.enabled,
  })
  didInit = didInit || isDatadogReady()
  return newly
}

export function isDatadogInitialized(): boolean {
  return didInit
}
