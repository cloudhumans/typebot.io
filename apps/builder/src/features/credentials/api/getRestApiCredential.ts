import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'
import { z } from 'zod'
import { isReadWorkspaceFobidden } from '@/features/workspace/helpers/isReadWorkspaceFobidden'
import { RestApiCredentials } from '@typebot.io/schemas'
import { maskedValue } from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'

export const getRestApiCredential = authenticatedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      credentialsId: z.string(),
    })
  )
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      baseUrl: z.string(),
      headers: z.array(z.object({ key: z.string(), value: z.string() })),
      queryParams: z.array(z.object({ key: z.string(), value: z.string() })),
    })
  )
  .query(async ({ input: { workspaceId, credentialsId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        id: true,
        members: true,
        credentials: {
          where: { id: credentialsId, type: 'rest-api' },
        },
      },
    })

    if (!workspace || isReadWorkspaceFobidden(workspace, user))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

    const credential = workspace.credentials[0]
    if (!credential)
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Credential not found',
      })

    let decrypted: RestApiCredentials['data']
    try {
      decrypted = (await decrypt(
        credential.data,
        credential.iv
      )) as RestApiCredentials['data']
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not read credential',
      })
    }

    return {
      id: credential.id,
      name: credential.name,
      baseUrl: decrypted.baseUrl,
      headers: (decrypted.headers ?? []).map((h) => ({
        key: h.key,
        value: maskedValue,
      })),
      queryParams: (decrypted.queryParams ?? []).map((q) => ({
        key: q.key,
        value: maskedValue,
      })),
    }
  })
