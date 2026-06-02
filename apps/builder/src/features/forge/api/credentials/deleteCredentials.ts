import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
import logger from '@typebot.io/lib/logger'

export const deleteCredentials = authenticatedProcedure
  .input(
    z.object({
      credentialsId: z.string(),
      workspaceId: z.string(),
      force: z.boolean().optional(),
    })
  )
  .mutation(
    async ({ input: { credentialsId, workspaceId, force }, ctx: { user } }) => {
      const workspace = await prisma.workspace.findUnique({
        where: {
          id: workspaceId,
        },
        select: { id: true, members: true },
      })
      if (!workspace || isWriteWorkspaceForbidden(workspace, user))
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })

      const result = await prisma.$transaction(
        async (tx) => {
          const usages = await findCredentialsUsages(
            credentialsId,
            workspaceId,
            tx
          )

          if (usages.length > 0 && !force) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Credential in use by ${usages.length} flow(s).`,
              cause: { usages },
            })
          }

          if (usages.length > 0 && force) {
            logger.warn('credential_force_deleted', {
              code: 'credential_force_deleted',
              credentialsId,
              workspaceId,
              userId: user.id,
              userEmail: user.email,
              usagesCount: usages.length,
              affectedFlows: usages.map((u) => ({
                source: u.source,
                typebotId: u.typebotId,
                publicId: u.publicId,
                name: u.name,
              })),
              endpoint: 'forge.credentials.deleteCredentials',
            })
          }

          const deletedCount = await tx.credentials.deleteMany({
            where: {
              id: credentialsId,
              workspaceId,
            },
          })
          return { deletedCount: deletedCount.count }
        },
        { isolationLevel: 'RepeatableRead' }
      )

      if (result.deletedCount === 0)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Credentials not found',
        })
      return { credentialsId }
    }
  )
