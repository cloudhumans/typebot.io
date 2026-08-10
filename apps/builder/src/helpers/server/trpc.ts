import { TRPCError, initTRPC } from '@trpc/server'
import { Context } from './context'
import { OpenApiMeta } from '@lilyrose2798/trpc-openapi'
import superjson from 'superjson'
import * as Sentry from '@sentry/nextjs'
import { ZodError } from 'zod'
import { createDatadogLoggerMiddleware } from '@typebot.io/lib/trpc/createDatadogLoggerMiddleware'
import { User } from '@typebot.io/prisma'

// Discriminates a TRPCError cause produced by the credential-in-use guard,
// so the errorFormatter only forwards `usages` for that intentional code path
// and stays safe when other procedures pass primitives or unrelated objects as
// cause (e.g. custom domain procedures pass a string).
const isCredentialInUseCause = (
  cause: unknown
): cause is { _credentialInUse: true; usages: unknown } =>
  typeof cause === 'object' &&
  cause !== null &&
  '_credentialInUse' in cause &&
  (cause as { _credentialInUse: unknown })._credentialInUse === true

const t = initTRPC
  .context<Context>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
          usages: isCredentialInUseCause(error.cause)
            ? error.cause.usages
            : null,
        },
      }
    },
  })

const datadogLoggerMiddleware = createDatadogLoggerMiddleware(t, {
  service: 'typebot-builder',
})

const sentryMiddleware = t.middleware(
  Sentry.Handlers.trpcMiddleware({
    attachRpcInput: true,
  })
)

const injectUser = t.middleware(({ next, ctx }) => {
  return next({
    ctx: {
      user: ctx.user,
    },
  })
})

const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: { user: ctx.user as User },
  })
})

// Ordem: logger/datadog, depois sentry, depois auth/user
const finalMiddleware = datadogLoggerMiddleware
  .unstable_pipe(sentryMiddleware)
  .unstable_pipe(injectUser)

const authenticatedMiddleware = datadogLoggerMiddleware
  .unstable_pipe(sentryMiddleware)
  .unstable_pipe(isAuthed)

export const middleware = t.middleware

export const router = t.router
export const mergeRouters = t.mergeRouters

export const publicProcedure = t.procedure.use(finalMiddleware)

export const authenticatedProcedure = t.procedure
  .use(authenticatedMiddleware)
  .use(
    t.middleware(({ next, ctx }) =>
      next({ ctx: ctx as Context & { user: User } })
    )
  )
