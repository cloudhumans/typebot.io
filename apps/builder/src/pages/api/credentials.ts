import prisma from '@typebot.io/lib/prisma'
import { Credentials } from '@typebot.io/schemas'
import { NextApiRequest, NextApiResponse } from 'next'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notAuthenticated,
} from '@typebot.io/lib/api'
import { encrypt } from '@typebot.io/lib/api/encryption/encrypt'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await getAuthenticatedUser(req, res)
  if (!user) return notAuthenticated(res)
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) return badRequest(res)
  if (req.method === 'GET') {
    const credentials = await prisma.credentials.findMany({
      where: {
        workspace: { id: workspaceId, members: { some: { userId: user.id } } },
      },
      select: { name: true, type: true, workspaceId: true, id: true },
    })
    return res.send({ credentials })
  }
  if (req.method === 'POST') {
    const data = (
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    ) as Credentials
    // 'rest-api' credentials must go through the tRPC `createCredentials` route,
    // which enforces the admin gate, base-URL safety validation (isSafeBaseUrl)
    // and `createdById`. This legacy route only checks workspace membership and
    // skips zod/admin validation, so allowing rest-api here would bypass all of
    // that. Reject it explicitly; other credential types keep prior behavior.
    if (data.type === 'rest-api')
      return forbidden(
        res,
        'REST API credentials must be created via the credentials tRPC route.'
      )
    const { encryptedData, iv } = await encrypt(data.data)
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, members: { some: { userId: user.id } } },
      select: { id: true },
    })
    if (!workspace) return forbidden(res)
    const credentials = await prisma.credentials.create({
      data: {
        ...data,
        data: encryptedData,
        iv,
        workspaceId,
      },
    })
    return res.send({ credentials })
  }
  return methodNotAllowed(res)
}

export default handler
