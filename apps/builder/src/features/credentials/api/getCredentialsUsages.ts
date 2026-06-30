import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { isAdminWriteWorkspaceForbidden } from '@/features/workspace/helpers/isAdminWriteWorkspaceForbidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'

// Read-only counterpart of the deleteCredentials in-use guard: lets the client
// learn whether a credential is referenced *before* attempting a delete, so the
// in-use modal can open without a failed (412) request polluting the console.
// The mutation still re-checks atomically, so this is only a UX pre-check —
// but it must match deleteCredentials' authorization (write access, plus the
// admin gate for rest-api) so it never reveals usages to someone who couldn't
// delete the credential anyway.
export const getCredentialsUsages = authenticatedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      credentialsId: z.string(),
    })
  )
  .query(async ({ input: { workspaceId, credentialsId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { id: true, members: true },
    })
    if (!workspace || isWriteWorkspaceForbidden(workspace, user))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

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
        message: 'Only workspace admins can manage this credential',
      })

    const usages = await findCredentialsUsages(credentialsId, workspaceId)
    return { usages }
  })
