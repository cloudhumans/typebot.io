import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { workspaceSchema } from '@typebot.io/schemas'
import { z } from 'zod'
import { getCognitoAccessibleWorkspaceIds } from '../helpers/cognitoUtils'

export const listWorkspaces = authenticatedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/workspaces',
      protect: true,
      summary: 'List workspaces',
      tags: ['Workspace'],
    },
  })
  .input(z.void())
  .output(
    z.object({
      workspaces: z.array(
        workspaceSchema.pick({ id: true, name: true, icon: true, plan: true })
      ),
    })
  )
  .query(async ({ ctx: { user } }) => {
    const cognitoAccess = getCognitoAccessibleWorkspaceIds(user)

    const workspaces = await findWorkspaces(user.id, cognitoAccess)

    if (workspaces.length === 0)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No workspaces found' })

    return { workspaces }
  })

const workspaceSelect = {
  id: true,
  name: true,
  icon: true,
  plan: true,
} as const

const findAllNonPersonalWorkspaces = () =>
  prisma.workspace.findMany({
    where: { NOT: { name: { contains: "'s workspace" } } },
    select: workspaceSelect,
  })

const findMemberWorkspaces = (userId: string) =>
  prisma.workspace.findMany({
    where: { members: { some: { userId } } },
    select: workspaceSelect,
  })

const findMemberOrCognitoWorkspaces = (
  userId: string,
  cognitoWorkspaceIds: string[]
) =>
  prisma.workspace.findMany({
    where: {
      OR: [
        { members: { some: { userId } } },
        { id: { in: cognitoWorkspaceIds } },
      ],
    },
    select: workspaceSelect,
  })

const findWorkspaces = (userId: string, cognitoAccess: 'all' | string[]) => {
  if (cognitoAccess === 'all') return findAllNonPersonalWorkspaces()
  if (cognitoAccess.length > 0)
    return findMemberOrCognitoWorkspaces(userId, cognitoAccess)
  return findMemberWorkspaces(userId)
}
