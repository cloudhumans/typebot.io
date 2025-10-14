import tracer from 'dd-trace'

export interface DatadogInitOptions {
  service?: string
  env?: string
  version?: string
  logInjection?: boolean
  enabled?: boolean
  /** Explicit agent URL (e.g. http://datadog-agent:8126 or unix:///var/run/datadog/apm.socket). */
  agentUrl?: string
  /** Agent host (fallback if no agentUrl). */
  agentHost?: string
  /** Agent port (fallback if no agentUrl). */
  agentPort?: number | string
  /** Extra debug logging (overrides DEBUG_DATADOG). */
  debug?: boolean
}

/**
 * Ensures Datadog tracer is initialized exactly once (idempotent) on the server.
 * Should be called as early as possible (instrumentation.ts) to maximize auto‑instrumentation coverage.
 */
export function ensureDatadogInitialized(
  opts: DatadogInitOptions = {}
): boolean {
  if (typeof window !== 'undefined') return false
  if (process.env.NEXT_RUNTIME === 'edge') return false
  if (opts.enabled === false) return false
  try {
    if (!(tracer as any)._initialized) {
      const agentUrl =
        opts.agentUrl || process.env.DD_TRACE_AGENT_URL || undefined
      const agentHost =
        !agentUrl && (opts.agentHost || process.env.DD_AGENT_HOST)
          ? opts.agentHost || process.env.DD_AGENT_HOST
          : undefined
      const agentPort =
        !agentUrl && (opts.agentPort || process.env.DD_AGENT_PORT)

      const initOptions: any = {
        service: opts.service || process.env.DD_SERVICE || 'typebot-app',
        env: opts.env || process.env.DD_ENV || process.env.NODE_ENV,
        version: opts.version || process.env.DD_VERSION,
        logInjection: opts.logInjection ?? true,
      }
      if (agentUrl) initOptions.url = agentUrl
      else if (agentHost) {
        initOptions.hostname = agentHost
        if (agentPort) initOptions.port = Number(agentPort)
      }
      tracer.init(initOptions)
      const debug = opts.debug || process.env.DEBUG_DATADOG === 'true'
      if (debug) {
        console.log('[datadog] initialized', {
          service: initOptions.service,
          env: initOptions.env,
          version: initOptions.version,
          endpoint: agentUrl
            ? agentUrl
            : agentHost
            ? `${agentHost}:${agentPort || '8126'}`
            : 'default',
        })
      }
      return true
    }
  } catch (e) {
    if (opts.debug || process.env.DEBUG_DATADOG === 'true') {
      console.log('[datadog] init failed (ignored)', (e as any)?.message)
    }
    // Swallow init errors (double init etc.)
  }
  return false
}
