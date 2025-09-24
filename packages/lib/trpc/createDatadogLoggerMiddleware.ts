import tracer from 'dd-trace'

interface RequestLike {
  baseUrl?: unknown
  path?: unknown
}
interface NextOptions {
  ctx?: object
}
type NextFn = (opts?: NextOptions) => Promise<unknown>

export interface TRPCMiddlewareFactoryLike {
  middleware: (
    resolver: (opts: {
      ctx: any
      next: NextFn
      path?: string
      type?: string
    }) => any
  ) => any
}

const extractRoute = (
  req: unknown
): { baseUrl: string; path: string } | null => {
  if (!req || typeof req !== 'object') return null
  const { baseUrl, path } = req as RequestLike
  const b = typeof baseUrl === 'string' ? baseUrl : ''
  const p = typeof path === 'string' ? path : ''
  if (!b && !p) return null
  return { baseUrl: b, path: p }
}

export const createDatadogLoggerMiddleware = (
  t: TRPCMiddlewareFactoryLike,
  options?: { service?: string; autoInit?: boolean }
) =>
  t.middleware(
    async ({ ctx, next, path }: { ctx: any; next: NextFn; path?: string }) => {
      const debug = process.env.DEBUG_DATADOG === 'true'
      if (
        options?.autoInit !== false &&
        typeof window === 'undefined' &&
        (tracer as any)._initialized !== true &&
        process.env.NEXT_RUNTIME !== 'edge'
      ) {
        try {
          tracer.init({
            service:
              options?.service || process.env.DD_SERVICE || 'typebot-app',
            env: process.env.DD_ENV || process.env.NODE_ENV,
            logInjection: true,
          })
          if (debug) console.log('[datadog] tracer lazy-initialized')
        } catch {
          if (debug) console.log('[datadog] tracer init skipped')
        }
      }

      // Defensive: only attempt to read active scope if internal tracer ready
      const ddAny = tracer as any
      let span: any = undefined
      if (ddAny && ddAny._tracer) {
        try {
          span = ddAny.scope().active()
        } catch {
          if (debug) console.log('[datadog] failed to access active span')
        }
      } else if (debug) {
        console.log('[datadog] tracer not ready (_tracer missing)')
      }

      if (debug) console.log('[datadog] active span at entry:', !!span)
      let traceId: string | null = null
      let spanId: string | null = null
      const ddContext = span?.context?.()
      if (ddContext) {
        try {
          if (typeof ddContext.toTraceId === 'function')
            traceId = ddContext.toTraceId()
          if (typeof ddContext.toSpanId === 'function')
            spanId = ddContext.toSpanId()
        } catch {}
      }

      if (span && typeof span.setTag === 'function') {
        try {
          const reqObj = (ctx as { req?: unknown }).req
          const route = extractRoute(reqObj)
          let tagged = false
          if (route && debug) console.log('[datadog] extracted route', route)
          if (route && route.baseUrl && route.path) {
            const fullRoute = `${route.baseUrl}${route.path}`
            span.setTag('http.route', fullRoute)
            span.setTag('resource.name', `trpc ${fullRoute}`)
            tagged = true
            if (debug) console.log('[datadog] tagged via req route', fullRoute)
          }
          if (!tagged && path) {
            const pseudo = `/api/trpc/${path}`
            span.setTag('http.route', pseudo)
            span.setTag('resource.name', `trpc ${path}`)
            span.setTag('trpc.path', path)
            if (debug) console.log('[datadog] tagged via path fallback', path)
          }
          const maybeUser = ctx?.user
          if (
            maybeUser &&
            typeof maybeUser === 'object' &&
            'email' in maybeUser
          ) {
            try {
              span.setTag('user.email', (maybeUser as any).email)
              if (debug)
                console.log(
                  '[datadog] tagged user email',
                  (maybeUser as any).email
                )
            } catch {}
          }
        } catch {
          if (debug) console.log('[datadog] tagging failed')
        }
      }

      const result = await next({
        ctx: { ...(ctx as object), datadog: { traceId, spanId } },
      })
      if (debug) console.log('[datadog] propagated ids', { traceId, spanId })
      return result
    }
  )
