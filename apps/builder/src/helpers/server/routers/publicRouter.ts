import { billingRouter } from '@/features/billing/api/router'
import { webhookRouter } from '@/features/blocks/integrations/webhook/api/router'
import { getLinkedTypebots } from '@/features/blocks/logic/typebotLink/api/getLinkedTypebots'
import { credentialsRouter } from '@/features/credentials/api/router'
import { resultsRouter } from '@/features/results/api/router'
import { themeRouter } from '@/features/theme/api/router'
import { typebotRouter } from '@/features/typebot/api/router'
import { workspaceRouter } from '@/features/workspace/api/router'
import { router, publicProcedure } from '../trpc'
import { analyticsRouter } from '@/features/analytics/api/router'
import { collaboratorsRouter } from '@/features/collaboration/api/router'
import { customDomainsRouter } from '@/features/customDomains/api/router'
import { publicWhatsAppRouter } from '@/features/whatsapp/router'
import { folderRouter } from '@/features/folders/api/router'
import { observable } from '@trpc/server/observable'
import { z } from 'zod'

const onlineUsers = new Map<
  string,
  Set<{ id: string; sessionId: string; name?: string; email?: string }>
>()

export const publicRouter = router({
  getLinkedTypebots,
  analytics: analyticsRouter,
  workspace: workspaceRouter,
  typebot: typebotRouter,
  webhook: webhookRouter,
  results: resultsRouter,
  billing: billingRouter,
  credentials: credentialsRouter,
  theme: themeRouter,
  collaborators: collaboratorsRouter,
  customDomains: customDomainsRouter,
  whatsApp: publicWhatsAppRouter,
  folders: folderRouter,
  onlineUsers: publicProcedure
    .input(
      z.object({
        typebotId: z.string(),
        user: z.object({
          id: z.string(),
          name: z.string().optional(),
          email: z.string().optional(),
        }),
      })
    )
    .subscription(({ input }) => {
      return observable<{
        count: number
        users: Array<{ id: string; name?: string; email?: string }>
      }>((emit) => {
        const { typebotId, user } = input
        const sessionId = Math.random().toString(36).substring(2, 15) // Gerar ID único para sessão

        console.log(
          `User ${user.name} (${user.id}) connected to typebot ${typebotId} with session ${sessionId}`
        )

        if (!onlineUsers.has(typebotId)) {
          onlineUsers.set(typebotId, new Set())
        }
        const typebotUsers = onlineUsers.get(typebotId)!
        typebotUsers.add({
          id: user.id,
          email: user.email,
          name: user.name,
          sessionId,
        })

        const broadcastUpdate = async () => {
          const users = onlineUsers.get(typebotId)
          if (users) {
            const userIds = Array.from(users).map((user) => user.id)
            const uniqueUserIds = [...new Set(userIds)]

            emit.next({
              count: uniqueUserIds.length,
              users: Array.from(users),
            })
          }
        }

        broadcastUpdate()

        const interval = setInterval(broadcastUpdate, 2000)

        return () => {
          const users = onlineUsers.get(typebotId)
          if (users) {
            for (const user of users) {
              if (user.sessionId === sessionId) {
                users.delete(user)
                break
              }
            }
            if (users.size === 0) {
              onlineUsers.delete(typebotId)
            }
          }
          clearInterval(interval)
        }
      })
    }),
})

export type PublicRouter = typeof publicRouter
