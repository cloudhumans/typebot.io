import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { isAdminWriteWorkspaceForbidden } from '@/features/workspace/helpers/isAdminWriteWorkspaceForbidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
import logger from '@typebot.io/lib/logger'

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
      // Delete even if still referenced by flows; published flows then break
      // until reconfigured and republished.
      force: z.boolean().optional(),
      // Draft of the flow open in the editor — excluded from the in-use guard
      // since the editor clears the block on delete success.
      currentTypebotId: z.string().optional(),
    })
  )
  .output(
    z.object({
      credentialsId: z.string(),
    })
  )
  .mutation(
    async ({
      input: { credentialsId, workspaceId, force, currentTypebotId },
      ctx: { user },
    }) => {
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

      // REST API credentials are admin-only to create; deletion must match that
      // bar, otherwise a non-admin member could remove an admin-managed
      // credential. Other credential types keep the write-access gate above.
      const credential = await prisma.credentials.findFirst({
        where: { id: credentialsId, workspaceId },
        select: { type: true },
      })
      if (
        credential?.type === 'rest-api' &&
        isAdminWriteWorkspaceForbidden(workspace, user)
      )
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only workspace admins can delete REST API credentials',
        })

      const result = await prisma.$transaction(
        async (tx) => {
          const usages = await findCredentialsUsages(
            credentialsId,
            workspaceId,
            tx
          )

          // Only a draft *block* usage of the open flow is excluded — the editor
          // clears that block on success. WhatsApp usages (via: 'whatsApp') drive
          // the published flow, so they always block.
          const blockingUsages = usages.filter(
            (u) =>
              !(
                u.source === 'Typebot' &&
                u.via === 'block' &&
                u.typebotId === currentTypebotId
              )
          )

          if (blockingUsages.length > 0 && !force)
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Credential in use by ${blockingUsages.length} flow(s). Detach it from every flow before deleting.`,
              cause: { _credentialInUse: true, usages: blockingUsages },
            })

          // Audit every deletion of a still-referenced credential, whether it
          // was forced or allowed because the only referencing flow is the
          // current draft — so the draft-exclusion path can't delete silently.
          if (usages.length > 0)
            logger.warn('Deleting credential still referenced by flows', {
              code: 'credential_deleted_in_use',
              credentialsId,
              workspaceId,
              userId: user.id,
              usageCount: usages.length,
              blockingCount: blockingUsages.length,
              forced: !!force,
            })

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
