// Next.js instrumentation entrypoint (Node runtime only)
// Initializes Datadog tracer early for auto-instrumentation.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
import { ensureDatadogInitialized } from '@typebot.io/lib/trpc/datadogInit'

ensureDatadogInitialized({
  service: 'typebot-viewer',
  env: process.env.DD_ENV,
  version: process.env.DD_VERSION || process.env.VERCEL_GIT_COMMIT_SHA,
  enabled: process.env.DD_TRACE_ENABLED !== 'false',
})

export function register() {}
