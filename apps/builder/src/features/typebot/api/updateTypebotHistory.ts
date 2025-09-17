import { Prisma } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'
import crypto from 'crypto'

export const updateTypebotHistory = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{typebotId}/history',
      protect: true,
      summary: 'Create a history snapshot for a typebot',
      tags: ['Typebot'],
    },
  })
  .input(
    z.object({
      typebotId: z
        .string()
        .describe(
          "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)"
        ),
      origin: z
        .enum(['PUBLISH', 'DUPLICATION', 'MANUAL', 'IMPORT', 'RESTORE'])
        .default('MANUAL'),
      authorName: z.string().optional(),
      restoredFromId: z.string().optional(),
      publishedAt: z.date().optional(),
    })
  )
  .output(
    z.object({
      historyId: z.string(),
    })
  )
  .mutation(
    async ({
      input: { typebotId, origin, authorName, restoredFromId, publishedAt },
      ctx: { user },
    }) => {
      const existingTypebot = await prisma.typebot.findFirst({
        where: {
          id: typebotId,
        },
        select: {
          id: true,
          version: true,
          name: true,
          icon: true,
          folderId: true,
          groups: true,
          events: true,
          variables: true,
          edges: true,
          theme: true,
          selectedThemeTemplateId: true,
          settings: true,
          resultsTablePreferences: true,
          publicId: true,
          customDomain: true,
          workspaceId: true,
          isArchived: true,
          isClosed: true,
          riskLevel: true,
          whatsAppCredentialsId: true,
          collaborators: {
            select: {
              userId: true,
              type: true,
            },
          },
          workspace: {
            select: {
              id: true,
              plan: true,
              isSuspended: true,
              isPastDue: true,
              members: {
                select: {
                  userId: true,
                  role: true,
                },
              },
            },
          },
        },
      })

      if (
        !existingTypebot?.id ||
        (await isWriteTypebotForbidden(existingTypebot, user))
      )
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Typebot not found',
        })

      const typebotSnapshot = {
        name: existingTypebot.name,
        icon: existingTypebot.icon,
        folderId: existingTypebot.folderId,
        groups: existingTypebot.groups,
        events: existingTypebot.events,
        variables: existingTypebot.variables,
        edges: existingTypebot.edges,
        theme: existingTypebot.theme,
        selectedThemeTemplateId: existingTypebot.selectedThemeTemplateId,
        settings: existingTypebot.settings,
        resultsTablePreferences: existingTypebot.resultsTablePreferences,
        publicId: existingTypebot.publicId,
        customDomain: existingTypebot.customDomain,
        isArchived: existingTypebot.isArchived,
        isClosed: existingTypebot.isClosed,
        riskLevel: existingTypebot.riskLevel,
        whatsAppCredentialsId: existingTypebot.whatsAppCredentialsId,
      }

      const snapshotString = JSON.stringify(
        typebotSnapshot,
        Object.keys(typebotSnapshot).sort()
      )
      const snapshotChecksum = crypto
        .createHash('sha256')
        .update(snapshotString)
        .digest('hex')

      const existingSnapshot = await prisma.typebotHistory.findUnique({
        where: {
          typebotId_snapshotChecksum: {
            typebotId: existingTypebot.id,
            snapshotChecksum,
          },
        },
        select: { id: true },
      })

      if (existingSnapshot) {
        return { historyId: existingSnapshot.id }
      }

      const newHistory = await prisma.typebotHistory.create({
        data: {
          typebotId: existingTypebot.id,
          version: existingTypebot.version,
          authorId: user?.id,
          authorName: authorName || user?.name || undefined,
          origin,
          publishedAt,
          isRestored: !!restoredFromId,
          restoredFromId,

          name: existingTypebot.name,
          icon: existingTypebot.icon,
          folderId: existingTypebot.folderId,
          groups: existingTypebot.groups || Prisma.JsonNull,
          events: existingTypebot.events || Prisma.JsonNull,
          variables: existingTypebot.variables || Prisma.JsonNull,
          edges: existingTypebot.edges || Prisma.JsonNull,
          theme: existingTypebot.theme || Prisma.JsonNull,
          selectedThemeTemplateId: existingTypebot.selectedThemeTemplateId,
          settings: existingTypebot.settings || Prisma.JsonNull,
          resultsTablePreferences: existingTypebot.resultsTablePreferences
            ? existingTypebot.resultsTablePreferences
            : Prisma.JsonNull,
          publicId: existingTypebot.publicId,
          customDomain: existingTypebot.customDomain,
          workspaceId: existingTypebot.workspaceId,
          isArchived: existingTypebot.isArchived,
          isClosed: existingTypebot.isClosed,
          riskLevel: existingTypebot.riskLevel,
          whatsAppCredentialsId: existingTypebot.whatsAppCredentialsId,

          snapshotChecksum,
        },
      })

      return { historyId: newHistory.id }
    }
  )
