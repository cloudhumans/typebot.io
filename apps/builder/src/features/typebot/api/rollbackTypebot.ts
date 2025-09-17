import { Prisma } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'
import { TypebotHistoryOrigin } from '@typebot.io/prisma'
import crypto from 'crypto'

export const rollbackTypebot = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{typebotId}/history/{historyId}/rollback',
      protect: true,
      summary: 'Rollback a typebot to a specific history snapshot',
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
      historyId: z
        .string()
        .describe('ID of the history snapshot to rollback to'),
    })
  )
  .output(
    z.object({
      message: z.string(),
      historyId: z.string(),
    })
  )
  .mutation(async ({ input: { typebotId, historyId }, ctx: { user } }) => {
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

    const historySnapshot = await prisma.typebotHistory.findFirst({
      where: {
        id: historyId,
        typebotId,
      },
      select: {
        id: true,
        name: true,
        icon: true,
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
        version: true,
      },
    })

    if (!historySnapshot)
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'History snapshot not found',
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

    const existingBackupSnapshot = await prisma.typebotHistory.findUnique({
      where: {
        typebotId_snapshotChecksum: {
          typebotId: existingTypebot.id,
          snapshotChecksum,
        },
      },
      select: { id: true },
    })

    if (!existingBackupSnapshot) {
      await prisma.typebotHistory.create({
        data: {
          typebotId: existingTypebot.id,
          version: existingTypebot.version,
          authorId: user?.id,
          origin: 'MANUAL' as TypebotHistoryOrigin,
          name: `before-restore-${existingTypebot.name}`,
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
    }
    await prisma.typebot.update({
      where: {
        id: typebotId,
      },
      data: {
        name: historySnapshot.name,
        icon: historySnapshot.icon,
        groups: historySnapshot.groups || Prisma.JsonNull,
        events: historySnapshot.events || Prisma.JsonNull,
        variables: historySnapshot.variables || Prisma.JsonNull,
        edges: historySnapshot.edges || Prisma.JsonNull,
        theme: historySnapshot.theme || Prisma.JsonNull,
        selectedThemeTemplateId: historySnapshot.selectedThemeTemplateId,
        settings: historySnapshot.settings || Prisma.JsonNull,
        resultsTablePreferences: historySnapshot.resultsTablePreferences
          ? historySnapshot.resultsTablePreferences
          : Prisma.JsonNull,
        publicId: historySnapshot.publicId,
        customDomain: historySnapshot.customDomain,
        isArchived: historySnapshot.isArchived,
        isClosed: historySnapshot.isClosed,
        riskLevel: historySnapshot.riskLevel,
        whatsAppCredentialsId: historySnapshot.whatsAppCredentialsId,
      },
    })

    const restoreSnapshot = {
      name: `restored-${historySnapshot.name}`,
      icon: historySnapshot.icon,
      folderId: existingTypebot.folderId,
      groups: historySnapshot.groups,
      events: historySnapshot.events,
      variables: historySnapshot.variables,
      edges: historySnapshot.edges,
      theme: historySnapshot.theme,
      selectedThemeTemplateId: historySnapshot.selectedThemeTemplateId,
      settings: historySnapshot.settings,
      resultsTablePreferences: historySnapshot.resultsTablePreferences,
      publicId: historySnapshot.publicId,
      customDomain: historySnapshot.customDomain,
      isArchived: historySnapshot.isArchived,
      isClosed: historySnapshot.isClosed,
      riskLevel: historySnapshot.riskLevel,
      whatsAppCredentialsId: historySnapshot.whatsAppCredentialsId,
    }

    const restoreSnapshotString = JSON.stringify(
      restoreSnapshot,
      Object.keys(restoreSnapshot).sort()
    )
    const restoreSnapshotChecksum = crypto
      .createHash('sha256')
      .update(restoreSnapshotString)
      .digest('hex')

    const existingSnapshot = await prisma.typebotHistory.findUnique({
      where: {
        typebotId_snapshotChecksum: {
          typebotId: existingTypebot.id,
          snapshotChecksum: restoreSnapshotChecksum,
        },
      },
      select: { id: true },
    })

    if (existingSnapshot) {
      return {
        message: `Successfully rolled back to snapshot: ${historySnapshot.name}`,
        historyId: existingSnapshot.id,
      }
    }

    const newHistory = await prisma.typebotHistory.create({
      data: {
        typebotId: existingTypebot.id,
        version: historySnapshot.version || existingTypebot.version,
        authorId: user?.id,
        origin: 'RESTORE' as TypebotHistoryOrigin,
        isRestored: true,
        restoredFromId: historyId,
        name: `restored-${historySnapshot.name}`,
        icon: historySnapshot.icon,
        folderId: existingTypebot.folderId,
        groups: historySnapshot.groups || Prisma.JsonNull,
        events: historySnapshot.events || Prisma.JsonNull,
        variables: historySnapshot.variables || Prisma.JsonNull,
        edges: historySnapshot.edges || Prisma.JsonNull,
        theme: historySnapshot.theme || Prisma.JsonNull,
        selectedThemeTemplateId: historySnapshot.selectedThemeTemplateId,
        settings: historySnapshot.settings || Prisma.JsonNull,
        resultsTablePreferences: historySnapshot.resultsTablePreferences
          ? historySnapshot.resultsTablePreferences
          : Prisma.JsonNull,
        publicId: historySnapshot.publicId,
        customDomain: historySnapshot.customDomain,
        workspaceId: existingTypebot.workspaceId,
        isArchived: historySnapshot.isArchived,
        isClosed: historySnapshot.isClosed,
        riskLevel: historySnapshot.riskLevel,
        whatsAppCredentialsId: historySnapshot.whatsAppCredentialsId,
        snapshotChecksum: restoreSnapshotChecksum,
      },
    })

    return {
      message: `Successfully rolled back to snapshot: ${historySnapshot.name}`,
      historyId: newHistory.id,
    }
  })
