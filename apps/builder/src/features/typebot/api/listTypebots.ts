import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { Prisma, WorkspaceRole } from '@typebot.io/prisma'
import { typebotV5Schema, settingsSchema } from '@typebot.io/schemas'
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
      status: z
        .preprocess(
          (val) =>
            typeof val === 'string' ? val.split(',').filter(Boolean) : val,
          z.array(z.enum(['active', 'inactive']))
        )
        .optional(),
      createdAtFrom: z.string().datetime().optional(),
      createdAtTo: z.string().datetime().optional(),
      excludeTools: z
        .preprocess(
          (val) => (typeof val === 'string' ? val === 'true' : val),
          z.boolean()
        )
        .optional()
        .describe('When true, omit TOOL-type typebots from the response.'),
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
          .merge(
            z.object({
              publishedTypebotId: z.string().optional(),
              isTool: z.boolean(),
            })
          )
      ),
    })
  )
  .query(
    async ({
      input: {
        workspaceId,
        folderId,
        search,
        status,
        createdAtFrom,
        createdAtTo,
        excludeTools,
      },
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

      const statusConditions: Prisma.TypebotWhereInput[] = (status ?? []).map(
        (s) =>
          s === 'active'
            ? { publishedTypebot: { isNot: null } }
            : { publishedTypebot: null }
      )

      const fromDate = createdAtFrom ? new Date(createdAtFrom) : undefined
      const toDate = createdAtTo ? new Date(createdAtTo) : undefined

      if (fromDate && toDate && fromDate > toDate)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'createdAtFrom must be before or equal to createdAtTo',
        })

      const createdAtFilter =
        fromDate || toDate
          ? {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            }
          : undefined

      const trimmedSearch = search?.trim()

      const typebots = await prisma.typebot.findMany({
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
          ...(trimmedSearch
            ? {
                name: { contains: trimmedSearch, mode: 'insensitive' as const },
              }
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
          settings: true,
          toolDescription: true,
        },
      })

      return {
        typebots: typebots
          .map((typebot) => {
            const parsedSettings = settingsSchema.safeParse(typebot.settings)
            const isTool =
              parsedSettings.success &&
              parsedSettings.data.general?.type === 'TOOL'
            return {
              publishedTypebotId: typebot.publishedTypebot?.id,
              isTool,
              ...omit(
                typebot,
                'publishedTypebot',
                'settings',
                'toolDescription'
              ),
            }
          })
          .filter((typebot) => !excludeTools || !typebot.isTool),
      }
    }
  )
