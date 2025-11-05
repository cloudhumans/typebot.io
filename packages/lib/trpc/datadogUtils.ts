// Shared Datadog tracer helpers (Node runtime only). Safe no-ops if tracer unavailable.
// Avoid importing 'dd-trace' directly in files that can be bundled for the browser.

export interface SafeSpanContextLike {
  toTraceId?: () => string | null
  toSpanId?: () => string | null
}
export interface SafeSpanLike {
  setTag?: (k: string, v: unknown) => void
  context?: () => SafeSpanContextLike | undefined
}
export interface SafeScopeLike {
  active?: () => SafeSpanLike | undefined
}
export interface SafeTracerLike {
  scope?: () => SafeScopeLike | undefined
  init?: (cfg: Record<string, any>) => void
  _initialized?: boolean
}

// Node runtime detection
const isNode = typeof window === 'undefined' && typeof process !== 'undefined'
let cachedTracer: SafeTracerLike | null = null

export function getTracer(): SafeTracerLike | null {
  if (!isNode) return null
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

export function getActiveSpan(): SafeSpanLike | null {
  const tracer = getTracer()
  const scopeFn = tracer?.scope
  if (typeof scopeFn !== 'function') return null
  try {
    const scope = scopeFn.call(tracer) as SafeScopeLike | undefined
    if (!scope || typeof scope.active !== 'function') return null
    return scope.active() || null
  } catch {
    return null
  }
}

export function extractTraceIds(span: SafeSpanLike | null): {
  traceId: string | null
  spanId: string | null
} {
  if (!span || typeof span.context !== 'function')
    return { traceId: null, spanId: null }
  try {
    const ctx = span.context()
    const traceId = ctx?.toTraceId?.() ?? null
    const spanId = ctx?.toSpanId?.() ?? null
    return { traceId, spanId }
  } catch {
    return { traceId: null, spanId: null }
  }
}

export function tagSpan(
  span: SafeSpanLike | null,
  tags: Record<string, unknown>
): void {
  if (!span || typeof span.setTag !== 'function') return
  for (const [k, v] of Object.entries(tags)) {
    try {
      span.setTag(k, v)
    } catch {
      // ignore tagging errors
    }
  }
}
