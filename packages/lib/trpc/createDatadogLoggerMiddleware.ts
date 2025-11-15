import tracer from 'dd-trace'
import { ensureDatadogInitialized } from './datadogInit'

interface RequestLike {
  baseUrl?: unknown
  path?: unknown
  url?: unknown
  originalUrl?: unknown
  method?: unknown
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

const extractRoute = (req: unknown): { route?: string; method?: string } => {
  if (!req || typeof req !== 'object') return {}
  const r = req as RequestLike
  const parts: string[] = []
  const base = typeof r.baseUrl === 'string' ? r.baseUrl : ''
  const p = typeof r.path === 'string' ? r.path : ''
  if (base || p) parts.push(`${base}${p}`)
  else {
    const url =
      (typeof r.originalUrl === 'string' && r.originalUrl) ||
      (typeof r.url === 'string' && r.url) ||
      ''
    if (url) parts.push(url.split('?')[0])
  }
  const method =
    typeof r.method === 'string' ? r.method.toUpperCase() : undefined
  return { route: parts[0], method }
}

const getScopeApi = () => {
  const scopeFn = (tracer as any)?.scope
  if (typeof scopeFn === 'function') {
    try {
      return scopeFn.call(tracer)
    } catch {
      return null
    }
  }
  return null
}

const getActiveSpan = () => {
  const scope = getScopeApi()
  if (scope && typeof scope.active === 'function') {
    try {
      return scope.active()
    } catch {
      return undefined
    }
  }
  return undefined
}

const tagUser = (span: any, user: any, debug: boolean) => {
  if (
    !span ||
    !user ||
    typeof user !== 'object' ||
    typeof span.setTag !== 'function'
  )
    return
  try {
    if ('email' in user) span.setTag('user.email', (user as any).email)
    if ('id' in user) span.setTag('user.id', (user as any).id)
    if (debug)
      console.log(
        '[datadog] tagged user info',
        (user as any).email,
        (user as any).id
      )
  } catch {
    if (debug) console.log('[datadog] user tagging failed')
  }
}

const tagError = (span: any, error: any, debug: boolean) => {
  if (!span || !error || typeof span.setTag !== 'function') return
  try {
    // dd-trace recognizes: error (boolean or object), error.type, error.msg, error.stack
    const errObj: any = error
    span.setTag('error', true)
    if (errObj?.name) span.setTag('error.type', errObj.name)
    if (errObj?.message) span.setTag('error.msg', errObj.message)
    if (errObj?.stack) span.setTag('error.stack', errObj.stack)
    // Extra context for TRPC errors or http-ish codes
    if (errObj?.code) span.setTag('error.code', errObj.code)
    if (errObj?.statusCode) span.setTag('http.status_code', errObj.statusCode)
    // Preserve legacy keys for any existing dashboards
    if (errObj?.message) span.setTag('error.message', errObj.message)
    if (debug)
      console.log('[datadog] tagged error', {
        name: errObj?.name,
        code: errObj?.code,
        statusCode: errObj?.statusCode,
      })
  } catch (e) {
    if (debug) console.log('[datadog] failed to tag error', (e as any)?.message)
  }
}

export const createDatadogLoggerMiddleware = (
  t: TRPCMiddlewareFactoryLike,
  options?: { service?: string; autoInit?: boolean }
) =>
  t.middleware(
    async ({ ctx, next, path }: { ctx: any; next: NextFn; path?: string }) => {
      const debug = process.env.DEBUG_DATADOG === 'true'
      // Root span mode strategy (experimental / debug aid):
      //   missing (default): create root span only if none is active.
      //   always: always create a new root span (forces a clean parent for each tRPC call)
      //   never: never create a root span (purely rely on auto-instrumentation)
      const rootSpanMode = (
        process.env.DD_TRPC_ROOT_MODE || 'missing'
      ).toLowerCase()
      if (options?.autoInit !== false) {
        const didInit = ensureDatadogInitialized({ service: options?.service })
        if (debug && didInit)
          console.log('[datadog] tracer lazy-initialized (middleware)')
      }

      // Attempt to get active span defensively
      let span: any = getActiveSpan()
      if (debug) console.log('[datadog] active span at entry:', !!span)

      // If there is no active span (can happen in some serverless/edge or ad-hoc executions)
      // create an explicit root span for this tRPC call so that downstream DB/HTTP spans have a parent.
      let createdRootSpan = false
      let rootSpan: any = span
      const scopeApi = getScopeApi()
      const spanName = 'trpc.request'
      const operationPath = path || 'unknown'
      const shouldCreateRoot =
        (rootSpanMode === 'missing' && !rootSpan) || rootSpanMode === 'always'
      if (
        shouldCreateRoot &&
        scopeApi &&
        typeof (tracer as any).startSpan === 'function'
      ) {
        try {
          rootSpan = (tracer as any).startSpan(spanName, {
            service: options?.service,
            resource: operationPath,
            tags: {
              'trpc.path': operationPath,
              component: 'trpc',
            },
          })
          createdRootSpan = true
          if (debug)
            console.log('[datadog] created root trpc span', operationPath, {
              mode: rootSpanMode,
              hadActiveBefore: !!span,
            })
        } catch (e) {
          if (debug) console.log('[datadog] failed to create root span', e)
        }
      }

      // Use this span reference (existing or newly created) for tagging.
      span = rootSpan || span
      let traceId: string | null = null
      let spanId: string | null = null
      const ddContext = span?.context?.()
      if (ddContext) {
        try {
          if (typeof ddContext.toTraceId === 'function')
            traceId = ddContext.toTraceId()
          if (typeof ddContext.toSpanId === 'function')
            spanId = ddContext.toSpanId()
        } catch {
          // silent; keep nulls
        }
      }

      if (span && typeof span.setTag === 'function') {
        try {
          const reqObj = (ctx as { req?: unknown }).req
          const { route, method } = extractRoute(reqObj)
          let finalRoute = route
          if (!finalRoute && path) finalRoute = `/api/trpc/${path}`
          const tags: Record<string, any> = { 'trpc.path': path }
          if (finalRoute) {
            tags['http.route'] = finalRoute
            // only overwrites resource.name if there is none (rootSpan) or if we created root span
            if (createdRootSpan || !span.context?._nameOverridden) {
              tags['resource.name'] = `trpc ${path}`
            }
          }
          if (method) tags['http.method'] = method
          span.addTags?.(tags) ||
            Object.entries(tags).forEach(([k, v]) => span.setTag(k, v))
          if (debug)
            console.log('[datadog] tagged route/method', { finalRoute, method })
          tagUser(span, (ctx as any).user, debug)
        } catch (e) {
          if (debug) console.error('[datadog] tagging failed', e)
        }
      }

      const runProcedure = async () =>
        next({
          ctx: { ...(ctx as object), datadog: { traceId, spanId } },
        })

      // Execute inside activation scope if we created a root span.
      let result: unknown
      let error: unknown = null
      if (
        createdRootSpan &&
        scopeApi &&
        typeof scopeApi.activate === 'function' &&
        rootSpan
      ) {
        if (debug) console.log('[datadog] activating root span scope')
        await scopeApi.activate(rootSpan, async () => {
          try {
            result = await runProcedure()
          } catch (err) {
            error = err
          }
        })
      } else {
        try {
          result = await runProcedure()
        } catch (err) {
          error = err
        }
      }

      if (error) {
        // Tag either the root span we created or the currently active span we reused.
        const target = rootSpan || span
        tagError(target, error, debug)
      }

      if (
        createdRootSpan &&
        rootSpan &&
        typeof rootSpan.finish === 'function'
      ) {
        try {
          rootSpan.finish()
          if (debug) console.log('[datadog] finished root span', operationPath)
        } catch {
          if (debug) console.log('[datadog] failed to finish root span')
        }
      }

      if (debug) {
        try {
          const rawCtx = span?.context?.()
          // Deep internal ID candidates (best-effort, dd-trace internals may change):
          const internal: Record<string, any> = {}
          const sc: any = (span as any)?._spanContext || (span as any)?._context
          const candidates: [string, any][] = [
            ['_spanContext._traceId', sc?._traceId],
            ['_spanContext._spanId', sc?._spanId],
            ['_spanContext.trace_id', sc?.trace_id],
            ['_spanContext.span_id', sc?.span_id],
            ['rawCtx._traceId', (rawCtx as any)?._traceId],
            ['rawCtx._spanId', (rawCtx as any)?._spanId],
            ['rawCtx.trace_id', (rawCtx as any)?.trace_id],
            ['rawCtx.span_id', (rawCtx as any)?.span_id],
          ]
          for (const [k, v] of candidates) {
            if (v != null) {
              try {
                internal[k] =
                  typeof v === 'object' && 'toString' in v ? v.toString() : v
              } catch {
                internal[k] = '[unserializable]'
              }
            }
          }
          console.log('[datadog] propagated ids', {
            mode: rootSpanMode,
            createdRootSpan,
            direct: { traceId, spanId },
            internal,
            hasRawCtx: !!rawCtx,
          })
        } catch (e) {
          console.log('[datadog] propagated ids', {
            traceId,
            spanId,
            error: (e as any)?.message,
          })
        }
      }
      if (error) throw error
      return result
    }
  )
