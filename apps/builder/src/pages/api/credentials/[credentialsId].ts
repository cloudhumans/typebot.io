import prisma from '@typebot.io/lib/prisma'
import { NextApiRequest, NextApiResponse } from 'next'
import {
  badRequest,
  methodNotAllowed,
  notAuthenticated,
} from '@typebot.io/lib/api'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
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

    const membership = await prisma.memberInWorkspace.findFirst({
      where: { workspaceId, userId: user.id },
      select: { workspaceId: true },
    })
    if (!membership)
      return res.status(404).send({ message: 'Workspace not found' })

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const usages = await findCredentialsUsages(
            credentialsId,
            workspaceId,
            tx
          )

          if (usages.length > 0 && !force) {
            return {
              precondition: 'in_use' as const,
              usages,
              deletedCount: 0,
            }
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
              endpoint: 'pages.api.credentials.[credentialsId]',
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
          message: `Credential in use by ${result.usages.length} flow(s).`,
          usages: result.usages,
        })

      return res.send({ credentials: { count: result.deletedCount } })
    } catch (error) {
      logger.error('Failed to delete credentials', {
        code: 'credential_delete_failed',
        credentialsId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
  return methodNotAllowed(res)
}

export default handler
