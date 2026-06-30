import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isReadWorkspaceFobidden } from '@/features/workspace/helpers/isReadWorkspaceFobidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'

// Read-only counterpart of the deleteCredentials in-use guard: lets the client
// learn whether a credential is referenced *before* attempting a delete, so the
// in-use modal can open without a failed (412) request polluting the console.
// The mutation still re-checks atomically, so this is only a UX pre-check.
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
    if (!workspace || isReadWorkspaceFobidden(workspace, user))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

    const usages = await findCredentialsUsages(credentialsId, workspaceId)
    return { usages }
  })
