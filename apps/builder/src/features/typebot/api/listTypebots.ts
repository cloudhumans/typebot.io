import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { WorkspaceRole } from '@typebot.io/prisma'
import { PublicTypebot, Typebot, typebotV5Schema } from '@typebot.io/schemas'
import { omit } from '@typebot.io/lib'
import { z } from 'zod'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'

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
      search: z.string().optional(),
      filters: z
        .object({
          status: z.array(z.enum(['ativo', 'inativo'])).optional(),
          createdAtFrom: z.string().datetime().optional(),
          createdAtTo: z.string().datetime().optional(),
        })
        .optional(),
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
            createdAt: true,
          })
          .merge(z.object({ publishedTypebotId: z.string().optional() }))
      ),
    })
  )
  .query(
    async ({
      input: { workspaceId, folderId, search, filters },
      ctx: { user },
    }) => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, members: true },
      })

      if (!workspace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })
      }

      const userRole = getUserRoleInWorkspace(
        user.id,
        workspace.members,
        workspaceId,
        user
      )

      if (!userRole) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })
      }

      const statusConditions: { publishedTypebotId: null | { not: null } }[] = (
        filters?.status ?? []
      ).map((s) =>
        s === 'ativo'
          ? { publishedTypebotId: { not: null } }
          : { publishedTypebotId: null }
      )

      const createdAtFilter =
        filters?.createdAtFrom || filters?.createdAtTo
          ? {
              ...(filters.createdAtFrom
                ? { gte: new Date(filters.createdAtFrom) }
                : {}),
              ...(filters.createdAtTo
                ? { lte: new Date(filters.createdAtTo) }
                : {}),
            }
          : undefined

      const typebots = (await prisma.typebot.findMany({
        where: {
          isArchived: { not: true },
          folderId:
            userRole === WorkspaceRole.GUEST
              ? undefined
              : folderId === 'root'
              ? null
              : folderId,
          workspaceId,
          collaborators:
            userRole === WorkspaceRole.GUEST
              ? { some: { userId: user.id } }
              : undefined,
          ...(search
            ? { name: { contains: search, mode: 'insensitive' as const } }
            : {}),
          ...(statusConditions.length > 0 ? { OR: statusConditions } : {}),
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          name: true,
          publishedTypebot: { select: { id: true } },
          id: true,
          icon: true,
          createdAt: true,
        },
      })) as (Pick<Typebot, 'name' | 'id' | 'icon' | 'createdAt'> & {
        publishedTypebot: Pick<PublicTypebot, 'id'>
      })[]

      if (!typebots)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No typebots found',
        })

      return {
        typebots: typebots.map((typebot) => ({
          publishedTypebotId: typebot.publishedTypebot?.id,
          ...omit(typebot, 'publishedTypebot'),
        })),
      }
    }
  )
