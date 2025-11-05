import { ensureDatadogInitialized } from './datadogInit'
import { getActiveSpan, extractTraceIds, tagSpan } from './datadogUtils'

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

/**
 * Configuração do middleware Datadog.
 * - service: overrides DD_SERVICE.
 * - autoInit: controls automatic initialization (default true).
 * - routeTagging: disable route tagging if false.
 * - userTagging: disable user tagging if false.
 * - enrichTags: optional function to append extra tags (e.g. tenantId, featureFlag).
 * - debug: forces debug logging ignoring DEBUG_DATADOG.
 */
export interface DatadogMiddlewareOptions<TCtx = any> {
  service?: string
  autoInit?: boolean
  routeTagging?: boolean
  userTagging?: boolean
  enrichTags?: (ctx: TCtx) => Record<string, unknown> | void
  debug?: boolean
}

/** Datadog tracing propagation + tagging middleware. Node-only, safe no-op on client. */
export const createDatadogLoggerMiddleware = <TCtx = any>(
  t: TRPCMiddlewareFactoryLike,
  options: DatadogMiddlewareOptions<TCtx> = {}
) =>
  t.middleware(
    async ({ ctx, next, path }: { ctx: TCtx; next: NextFn; path?: string }) => {
      const debug = options.debug ?? process.env.DEBUG_DATADOG === 'true'
      if (options.autoInit !== false) {
        const didInit = ensureDatadogInitialized({ service: options.service })
        if (debug && didInit)
          console.log('[datadog] tracer initialized (middleware)')
      }

      const span = getActiveSpan()
      if (debug) console.log('[datadog] active span:', !!span)
      const { traceId, spanId } = extractTraceIds(span)

      // Tagging logic
      if (span) {
        try {
          const tags: Record<string, unknown> = {}
          if (options.routeTagging !== false) {
            const reqObj = (ctx as any)?.req
            const route = extractRoute(reqObj)
            if (route?.baseUrl && route?.path) {
              const fullRoute = `${route.baseUrl}${route.path}`
              tags['http.route'] = fullRoute
              tags['resource.name'] = `trpc ${fullRoute}`
            } else if (path) {
              tags['http.route'] = `/api/trpc/${path}`
              tags['resource.name'] = `trpc ${path}`
              tags['trpc.path'] = path
            }
          }
          if (options.userTagging !== false) {
            const maybeUser = (ctx as any)?.user
            if (maybeUser && typeof maybeUser === 'object') {
              if ('email' in maybeUser)
                tags['user.email'] = (maybeUser as any).email
              if ('id' in maybeUser) tags['user.id'] = (maybeUser as any).id
            }
          }
          const extra = options.enrichTags?.(ctx)
          if (extra && typeof extra === 'object') Object.assign(tags, extra)
          tagSpan(span, tags)
          if (debug) console.log('[datadog] tagged span', tags)
        } catch (e) {
          if (debug) console.error('[datadog] tagging error', e)
        }
      }

      const result = await next({
        ctx: { ...(ctx as any), datadog: { traceId, spanId } },
      })
      if (debug) console.log('[datadog] propagated ids', { traceId, spanId })
      return result
    }
  )
