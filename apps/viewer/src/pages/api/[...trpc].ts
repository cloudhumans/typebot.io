import { appRouter } from '@/helpers/server/appRouter'
import * as Sentry from '@sentry/nextjs'
import { createOpenApiNextHandler } from '@lilyrose2798/trpc-openapi'
import cors from 'nextjs-cors'
import { NextApiRequest, NextApiResponse } from 'next'
import { createContext } from '@/helpers/server/context'
import logger from '@/helpers/logger'
import { logFailureOnce } from '@typebot.io/lib/datadogError'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await cors(req, res)

  return createOpenApiNextHandler({
    router: appRouter,
    createContext,
    onError({ error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        Sentry.captureException(error)
        logFailureOnce(
          logger,
          'Something went wrong',
          { trpcCode: error.code },
          error.cause instanceof Error ? error.cause : error
        )
      }
    },
  })(req, res)
}

export default handler
