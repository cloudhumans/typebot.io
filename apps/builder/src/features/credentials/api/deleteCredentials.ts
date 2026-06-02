import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'

export const deleteCredentials = authenticatedProcedure
  .meta({
    openapi: {
      method: 'DELETE',
      path: '/v1/credentials/:credentialsId',
      protect: true,
      summary: 'Delete credentials',
      tags: ['Credentials'],
    },
  })
  .input(
    z.object({
      credentialsId: z.string(),
      workspaceId: z.string(),
    })
  )
  .output(
    z.object({
      credentialsId: z.string(),
    })
  )
  .mutation(
    async ({ input: { credentialsId, workspaceId }, ctx: { user } }) => {
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

          if (usages.length > 0) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Credential in use by ${usages.length} flow(s). Detach it from every flow before deleting.`,
              cause: { usages },
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
