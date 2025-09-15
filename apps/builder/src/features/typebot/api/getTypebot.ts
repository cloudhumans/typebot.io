import prisma from '@typebot.io/lib/prisma'
import { publicProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { typebotSchema } from '@typebot.io/schemas'
import { z } from 'zod'
import { isReadTypebotForbidden } from '../helpers/isReadTypebotForbidden'
import { migrateTypebot } from '@typebot.io/migrations/migrateTypebot'
import { CollaborationType } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'

// Added: editor timeout & queue promotion now also evaluated on simple getTypebot

export const getTypebot = publicProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/typebots/{typebotId}',
      protect: true,
      summary: 'Get a typebot',
      tags: ['Typebot'],
    },
  })
  .input(
    z.object({
      typebotId: z
        .string()
        .describe(
          "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)"
        ),
      migrateToLatestVersion: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If enabled, the typebot will be converted to the latest schema version'
        ),
    })
  )
  .output(
    z.object({
      typebot: typebotSchema,
      currentUserMode: z.enum(['guest', 'read', 'write']),
    })
  )
  .query(
    async ({ input: { typebotId, migrateToLatestVersion }, ctx: { user } }) => {
      const existingTypebot = await prisma.typebot.findFirst({
        where: {
          id: typebotId,
        },
        include: {
          collaborators: true,
          workspace: {
            select: {
              isSuspended: true,
              isPastDue: true,
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      })
      if (
        !existingTypebot?.id ||
        (await isReadTypebotForbidden(existingTypebot, user))
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Typebot with ID: ${typebotId} not found or access forbidden. User: ${
            user?.id ?? 'unknown'
          }`,
        })
      }

      try {
        const parsedTypebot = migrateToLatestVersion
          ? await migrateTypebot(typebotSchema.parse(existingTypebot))
          : typebotSchema.parse(existingTypebot)

        // Queue enforcement: if user is in editing queue and not position 1, force guest mode
        let queuePosition: number | null = null
        if (user?.id) {
          try {
            const queueEntry = await prisma.typebotEditQueue.findUnique({
              where: { typebotId_userId: { typebotId, userId: user.id } },
              select: { position: true },
            })
            queuePosition = queueEntry?.position ?? null
          } catch {
            // Silently ignore (table might not exist yet on older self-host instances)
          }
        }

        return {
          typebot: parsedTypebot,
          currentUserMode: getCurrentUserMode(
            user,
            existingTypebot,
            queuePosition
          ),
        }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to parse typebot with ID: ${typebotId}`,
          cause: err,
        })
      }
    }
  )

const getCurrentUserMode = (
  user: { email: string | null; id: string } | undefined,
  typebot: { collaborators: { userId: string; type: CollaborationType }[] } & {
    workspace: { members: { userId: string }[] }
  },
  queuePosition?: number | null
) => {
  // If user is in the queue and not the active editor (position 1), force guest
  if (queuePosition != null && queuePosition !== 1) return 'guest'
  const collaborator = typebot.collaborators.find((c) => c.userId === user?.id)
  const isMemberOfWorkspace = typebot.workspace.members.some(
    (m) => m.userId === user?.id
  )
  if (
    collaborator?.type === 'WRITE' ||
    collaborator?.type === 'FULL_ACCESS' ||
    isMemberOfWorkspace
  )
    return 'write'

  if (collaborator) return 'read'
  if (user?.email && env.ADMIN_EMAIL?.includes(user.email)) return 'read'
  return 'guest'
}
