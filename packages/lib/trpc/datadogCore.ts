// Unified Datadog core helpers (Node runtime only)
// Provides idempotent initialization, tracer access, correlation IDs and optional span helper.
// Safe no-ops in browser / edge environments.
// Public (internal) API:
//   initDatadog(opts?) => boolean (true if newly initialized)
//   getTracer() => tracer | null
//   getCorrelation({ syntheticFallback?: boolean }) => { traceId, spanId }
//   withSpan(name, fn, { tags?, childOf? }) => Promise<R>
// Environment flags:
//   TYPEBOT_DD_DISABLE=1 -> skip init entirely
//   TYPEBOT_DD_SERVICE / DD_SERVICE -> service name
//   DD_ENV / NODE_ENV -> env tag
//   DD_VERSION -> version tag
// Edge/runtime detection to avoid unsupported init.

interface SafeSpanContextLike {
  toTraceId?: () => string | null
  toSpanId?: () => string | null
}
interface SafeSpanLike {
  context?: () => SafeSpanContextLike | undefined
  setTag?: (k: string, v: unknown) => void
  finish?: () => void
}
interface SafeScopeLike {
  active?: () => SafeSpanLike | undefined
}
interface SafeTracerLike {
  scope?: () => SafeScopeLike | undefined
  init?: (cfg: Record<string, any>) => void
  startSpan?: (name: string, opts?: Record<string, any>) => SafeSpanLike
  inject?: (span: any, format: string, carrier: Record<string, string>) => void
  _initialized?: boolean
}

const isNode = typeof window === 'undefined' && typeof process !== 'undefined'
const isEdge = process.env.NEXT_RUNTIME === 'edge'
let cachedTracer: SafeTracerLike | null = null
let didInit = false

export function getTracer(): SafeTracerLike | null {
  if (!isNode || isEdge) return null
  if (cachedTracer) return cachedTracer
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = Function('return require')()('dd-trace') as any as
      | SafeTracerLike
      | undefined
    cachedTracer = mod || null
  } catch {
    cachedTracer = null
  }
  return cachedTracer
}

export function initDatadog(
  opts: {
    service?: string
    env?: string
    version?: string
    logInjection?: boolean
    enabled?: boolean
  } = {}
): boolean {
  if (!isNode || isEdge) return false
  if (process.env.TYPEBOT_DD_DISABLE === '1') return false
  if (opts.enabled === false) return false
  if (didInit) return false
  const tracer = getTracer()
  if (!tracer) return false
  try {
    if (!tracer._initialized) {
      tracer.init?.({
        service:
          opts.service ||
          process.env.TYPEBOT_DD_SERVICE ||
          process.env.DD_SERVICE ||
          'typebot-app',
        env: opts.env || process.env.DD_ENV || process.env.NODE_ENV,
        version: opts.version || process.env.DD_VERSION,
        logInjection: opts.logInjection ?? true,
      })
    }
    didInit = true
    ;(global as any).__TYPEBOT_DD_READY__ = true
    return true
  } catch {
    ;(global as any).__TYPEBOT_DD_READY__ = false
    return false
  }
}

export function getCorrelation(opts: { syntheticFallback?: boolean } = {}) {
  const tracer = getTracer()
  let traceId: string | null = null
  let spanId: string | null = null
  try {
    const scope = tracer?.scope?.()
    const span = scope?.active?.()
    const ctx = span?.context?.()
    traceId = ctx?.toTraceId?.() ?? null
    spanId = ctx?.toSpanId?.() ?? null
  } catch {
    traceId = null
    spanId = null
  }
  if (opts.syntheticFallback) {
    if (!traceId) {
      traceId = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 10)}`.padEnd(20, '0')
    }
    if (!spanId) {
      spanId = Math.random().toString(16).slice(2, 18).padEnd(16, '0')
    }
  }
  return { traceId, spanId }
}

export async function withSpan<R>(
  name: string,
  fn: (span: SafeSpanLike | null) => Promise<R> | R,
  cfg: { tags?: Record<string, unknown>; childOf?: SafeSpanLike | null } = {}
): Promise<R> {
  const tracer = getTracer()
  if (!tracer || typeof tracer.startSpan !== 'function') {
    return await fn(null)
  }
  let span: SafeSpanLike | null = null
  try {
    span =
      tracer.startSpan?.(
        name,
        cfg.childOf ? { childOf: cfg.childOf } : undefined
      ) || null
    if (span && cfg.tags) {
      for (const [k, v] of Object.entries(cfg.tags)) {
        try {
          span.setTag?.(k, v)
        } catch {}
      }
    }
    const res = await fn(span)
    return res
  } catch (e) {
    try {
      span?.setTag?.('error', 1)
      span?.setTag?.('error.msg', e instanceof Error ? e.message : String(e))
    } catch {}
    throw e
  } finally {
    try {
      span?.finish?.()
    } catch {}
  }
}

// Optional immediate init if imported very early without explicit call.
if (process.env.TYPEBOT_DD_AUTO_BOOT === '1') {
  initDatadog({})
}

export function isDatadogReady() {
  return didInit
}
