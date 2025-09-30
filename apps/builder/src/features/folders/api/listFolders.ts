import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { WorkspaceRole } from '@typebot.io/prisma'
import { folderSchema } from '@typebot.io/schemas'
import { z } from 'zod'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'
import {
  extractCognitoUserClaims,
  hasWorkspaceAccess,
} from '@/features/workspace/helpers/cognitoUtils'

export const listFolders = authenticatedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/folders',
      protect: true,
      summary: 'List folders',
      tags: ['Folder'],
    },
  })
  .input(
    z.object({
      workspaceId: z.string(),
      parentFolderId: z.string().optional(),
    })
  )
  .output(
    z.object({
      folders: z.array(folderSchema),
    })
  )
  .query(async ({ input: { workspaceId, parentFolderId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, members: true, plan: true },
    })

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      })
    }

    const userRole = getUserRoleInWorkspace(user.id, workspace.members)

    // Check for Cognito-based access if user is not a database member
    let hasAccess = userRole !== undefined && userRole !== WorkspaceRole.GUEST

    if (!hasAccess) {
      const cognitoClaims = extractCognitoUserClaims(user)
      if (
        cognitoClaims &&
        workspace.name &&
        hasWorkspaceAccess(cognitoClaims, workspace.name)
      ) {
        hasAccess = true
      }
    }

    if (!hasAccess) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      })
    }

    const folders = await prisma.dashboardFolder.findMany({
      where: {
        workspaceId,
        parentFolderId: parentFolderId ?? null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return { folders }
  })
