import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { WorkspaceRole } from '@typebot.io/prisma'
import { PublicTypebot, Typebot, typebotV5Schema } from '@typebot.io/schemas'
import { omit } from '@typebot.io/lib'
import { z } from 'zod'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'
import {
  extractCognitoUserClaims,
  hasWorkspaceAccess,
  mapCognitoRoleToWorkspaceRole,
} from '@/features/workspace/helpers/cognitoUtils'

export const listTypebots = authenticatedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/typebots',
      protect: true,
      summary: 'List typebots',
      tags: ['Typebot'],
    },
  })
  .input(
    z.object({
      workspaceId: z
        .string()
        .describe(
          '[Where to find my workspace ID?](../how-to#how-to-find-my-workspaceid)'
        ),
      folderId: z.string().optional(),
    })
  )
  .output(
    z.object({
      typebots: z.array(
        typebotV5Schema._def.schema
          .pick({
            name: true,
            icon: true,
            id: true,
          })
          .merge(z.object({ publishedTypebotId: z.string().optional() }))
      ),
    })
  )
  .query(async ({ input: { workspaceId, folderId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, members: true },
    })

    if (!workspace) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })
    }

    const userRole = getUserRoleInWorkspace(user.id, workspace.members)

    // Check for Cognito-based access if user is not a database member
    let hasAccess = userRole !== undefined
    let effectiveRole = userRole

    if (!hasAccess) {
      const cognitoClaims = extractCognitoUserClaims(user)
      if (
        cognitoClaims &&
        workspace.name &&
        hasWorkspaceAccess(cognitoClaims, workspace.name)
      ) {
        hasAccess = true
        // Map Cognito role to workspace role for permission checks
        effectiveRole = cognitoClaims['custom:hub_role']
          ? mapCognitoRoleToWorkspaceRole(cognitoClaims['custom:hub_role'])
          : WorkspaceRole.MEMBER
      }
    }

    if (!hasAccess) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })
    }
    const typebots = (await prisma.typebot.findMany({
      where: {
        isArchived: { not: true },
        folderId:
          effectiveRole === WorkspaceRole.GUEST
            ? undefined
            : folderId === 'root'
            ? null
            : folderId,
        workspaceId,
        collaborators:
          effectiveRole === WorkspaceRole.GUEST
            ? { some: { userId: user.id } }
            : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        publishedTypebot: { select: { id: true } },
        id: true,
        icon: true,
      },
    })) as (Pick<Typebot, 'name' | 'id' | 'icon'> & {
      publishedTypebot: Pick<PublicTypebot, 'id'>
    })[]

    if (!typebots)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No typebots found' })

    return {
      typebots: typebots.map((typebot) => ({
        publishedTypebotId: typebot.publishedTypebot?.id,
        ...omit(typebot, 'publishedTypebot'),
      })),
    }
  })
