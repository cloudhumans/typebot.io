// Legacy compatibility layer re-exporting from datadogCore.
// Prefer importing from datadogCore directly for new code.
export {
  getTracer,
  withSpan,
  getCorrelation as extractCorrelation,
  isDatadogReady,
} from './datadogCore'

// Keep old function names for existing imports.
import { getCorrelation, getTracer, withSpan } from './datadogCore'

export function getActiveSpan() {
  const tracer = getTracer()
  const scope = tracer?.scope?.()
  return scope?.active?.() || null
}

export function extractTraceIds(span: any): {
  traceId: string | null
  spanId: string | null
} {
  if (!span || typeof span.context !== 'function')
    return { traceId: null, spanId: null }
  try {
    const ctx = span.context()
    return {
      traceId: ctx?.toTraceId?.() ?? null,
      spanId: ctx?.toSpanId?.() ?? null,
    }
  } catch {
    return { traceId: null, spanId: null }
  }
}

export function tagSpan(span: any, tags: Record<string, unknown>) {
  if (!span || typeof span.setTag !== 'function') return
  for (const [k, v] of Object.entries(tags)) {
    try {
      span.setTag(k, v)
    } catch {}
  }
}
