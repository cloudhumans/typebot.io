// Next.js instrumentation entrypoint (Node runtime only)
// Initializes Datadog tracer early for auto-instrumentation.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
import '@typebot.io/lib/trpc/datadogBootstrap'
import { ensureDatadogInitialized } from '@typebot.io/lib/trpc/datadogInit'

ensureDatadogInitialized({ service: 'typebot-builder' })

export function register() {}
