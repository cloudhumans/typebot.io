import {
  createTRPCProxyClient,
  httpBatchLink,
  loggerLink,
  wsLink,
  createWSClient,
  splitLink,
} from '@trpc/client'
import { createTRPCNext } from '@trpc/next'
import superjson from 'superjson'
import { env } from '@typebot.io/env'
import type { AppRouter } from '@/helpers/server/routers/appRouter'

const getBaseUrl = () => (typeof window !== 'undefined' ? '' : env.NEXTAUTH_URL)

const getWsUrl = () => 'ws://localhost:3004/api/trpc'

export const trpc = createTRPCNext<AppRouter>({
  config() {
    const wsClient =
      typeof window !== 'undefined' ? createWSClient({ url: getWsUrl() }) : null

    return {
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        splitLink({
          condition(op) {
            return op.type === 'subscription'
          },
          true: wsClient
            ? wsLink<AppRouter>({ client: wsClient })
            : httpBatchLink({ url: `${getBaseUrl()}/api/trpc` }),
          false: httpBatchLink({ url: `${getBaseUrl()}/api/trpc` }),
        }),
      ],
      transformer: superjson,
    }
  },
  ssr: false,
})

// function getEndingLink(): TRPCLink<AppRouter> {
//   if (typeof window === 'undefined') {
//     return httpBatchLink({
//       url: `${getBaseUrl()}/api/trpc`,
//     })
//   }

//   return wsLink({
//     client: createWSClient({
//       url: getWsUrl(),
//     }),
//   })
// }

export const trpcVanilla = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
  transformer: superjson,
})

export const defaultQueryOptions = {
  refetchOnMount: env.NEXT_PUBLIC_E2E_TEST,
}
