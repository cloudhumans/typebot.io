import prisma from '@typebot.io/lib/prisma'
import { NextApiRequest, NextApiResponse } from 'next'
import {
  badRequest,
  methodNotAllowed,
  notAuthenticated,
} from '@typebot.io/lib/api'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
import { isAdminWriteWorkspaceForbidden } from '@/features/workspace/helpers/isAdminWriteWorkspaceForbidden'
import logger from '@typebot.io/lib/logger'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await getAuthenticatedUser(req, res)
  if (!user) return notAuthenticated(res)
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) return badRequest(res)
  if (req.method === 'DELETE') {
    const credentialsId = req.query.credentialsId as string | undefined
    if (!credentialsId) return badRequest(res)
    const force = req.query.force === 'true'
    const currentTypebotId = req.query.currentTypebotId as string | undefined

    const membership = await prisma.memberInWorkspace.findFirst({
      where: { workspaceId, userId: user.id },
      select: { workspaceId: true },
    })
    if (!membership)
      return res.status(404).send({ message: 'Workspace not found' })

    // REST API credentials are admin-only to create and delete (mirrors the tRPC
    // deleteCredentials gate). This legacy REST route would otherwise let any
    // member remove an admin-managed credential, bypassing that lifecycle.
    const credential = await prisma.credentials.findFirst({
      where: { id: credentialsId, workspaceId },
      select: { type: true },
    })
    if (credential?.type === 'rest-api') {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, members: true },
      })
      if (!workspace || isAdminWriteWorkspaceForbidden(workspace, user))
        return res.status(403).send({
          message: 'Only workspace admins can delete REST API credentials',
        })
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const usages = await findCredentialsUsages(
            credentialsId,
            workspaceId,
            tx
          )

          // Mirror the tRPC guard: the draft open in the editor doesn't block
          // its own deletion (the editor clears the block on success).
          const blockingUsages = usages.filter(
            (u) =>
              !(
                u.source === 'Typebot' &&
                u.via === 'block' &&
                u.typebotId === currentTypebotId
              )
          )

          if (blockingUsages.length > 0 && !force) {
            return {
              precondition: 'in_use' as const,
              usages: blockingUsages,
              deletedCount: 0,
            }
          }

          if (usages.length > 0) {
            logger.warn('Deleting credential still referenced by flows', {
              code: 'credential_deleted_in_use',
              credentialsId,
              workspaceId,
              userId: user.id,
              usageCount: usages.length,
              blockingCount: blockingUsages.length,
              forced: force,
            })
          }

          const deleted = await tx.credentials.deleteMany({
            where: { id: credentialsId, workspaceId },
          })
          return { precondition: null, usages: [], deletedCount: deleted.count }
        },
        { isolationLevel: 'RepeatableRead' }
      )

      if (result.precondition === 'in_use')
        return res.status(412).send({
          message: `Credential in use by ${result.usages.length} flow(s). Detach it from every flow before deleting.`,
          usages: result.usages,
        })

      return res.send({ credentials: { count: result.deletedCount } })
    } catch (error) {
      logger.error('Failed to delete credentials', {
        code: 'credential_delete_failed',
        credentialsId,
        workspaceId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      })
      throw error
    }
  }
  return methodNotAllowed(res)
}

export default handler
