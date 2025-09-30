import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { workspaceMemberSchema } from '@typebot.io/schemas'
import { z } from 'zod'
import { isReadWorkspaceFobidden } from '../helpers/isReadWorkspaceFobidden'
import {
  extractCognitoUserClaims,
  hasWorkspaceAccess,
  mapCognitoRoleToWorkspaceRole,
} from '../helpers/cognitoUtils'

export const listMembersInWorkspace = authenticatedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/workspaces/{workspaceId}/members',
      protect: true,
      summary: 'List members in workspace',
      tags: ['Workspace'],
    },
  })
  .input(
    z.object({
      workspaceId: z
        .string()
        .describe(
          '[Where to find my workspace ID?](../how-to#how-to-find-my-workspaceid)'
        ),
    })
  )
  .output(
    z.object({
      members: z.array(workspaceMemberSchema),
    })
  )
  .query(async ({ input: { workspaceId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    })

    if (!workspace || isReadWorkspaceFobidden(workspace, user))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No workspaces found' })

    // Get database members
    const dbMembers = workspace.members.map((member) => ({
      role: member.role,
      user: member.user,
      workspaceId,
      userId: member.userId,
    }))

    // Check if current user has Cognito-based access and isn't already a database member
    const cognitoClaims = extractCognitoUserClaims(user)
    const isDbMember = workspace.members.some(
      (member) => member.userId === user.id
    )

    let allMembers = dbMembers

    if (
      cognitoClaims &&
      workspace.name &&
      hasWorkspaceAccess(cognitoClaims, workspace.name) &&
      !isDbMember
    ) {
      // Add virtual member for current Cognito user
      const cognitoRole = cognitoClaims['custom:hub_role']
        ? mapCognitoRoleToWorkspaceRole(cognitoClaims['custom:hub_role'])
        : 'MEMBER'

      // Fetch the full user object for the virtual member
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
      })

      if (fullUser) {
        const virtualMember = {
          role: cognitoRole,
          user: fullUser,
          workspaceId,
          userId: user.id,
        }

        allMembers = [...dbMembers, virtualMember]
      }
    }

    return {
      members: allMembers,
    }
  })
