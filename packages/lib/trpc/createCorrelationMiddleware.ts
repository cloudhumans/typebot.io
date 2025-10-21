import tracer from 'dd-trace'
import { resolveCorrelationId, applyCorrelationToSpan } from '../correlation'

export const createCorrelationMiddleware = (t: { middleware: any }) =>
  t.middleware(async ({ ctx, next }: { ctx: any; next: any }) => {
    const headers = (ctx as any)?.req?.headers || {}
    const correlation = resolveCorrelationId(headers as Record<string, unknown>)
    let span: any
    const scopeFn = (tracer as any)?.scope
    if (typeof scopeFn === 'function') {
      try {
        const scope = scopeFn.call(tracer)
        if (scope && typeof scope.active === 'function') span = scope.active()
      } catch {}
    }
    applyCorrelationToSpan(span, correlation)
    return next({ ctx: { ...ctx, correlationId: correlation.id } })
  })
