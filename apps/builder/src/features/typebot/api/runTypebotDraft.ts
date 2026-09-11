import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import {
  draftRunResultSchema,
  settingsSchema,
  startTypebotSchema,
} from '@typebot.io/schemas'
import { z } from 'zod'
import { isWriteTypebotForbidden } from '@/features/typebot/helpers/isWriteTypebotForbidden'
import { executeDraftWorkflow } from '@typebot.io/mcp-tools'

export const runTypebotDraft = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{typebotId}/preview/run',
      protect: true,
      summary: 'Run a TOOL or CONTEXT_ENRICHMENT draft headlessly',
      tags: ['Typebot'],
    },
  })
  .input(
    z.object({
      typebotId: z
        .string()
        .describe(
          'Id of the TOOL or CONTEXT_ENRICHMENT flow, as returned by listTypebots or createTypebot.'
        ),
      variables: z
        .record(z.unknown())
        .optional()
        .describe(
          'Input values keyed by variable name. For a TOOL: the names the Declare Variables block exposes as the tool parameters. For a CONTEXT_ENRICHMENT flow: the conversation context Claudia injects in production (helpdeskId, cloudChatId, activeIntent, channelType, language, createdAt, frustrationScore, abKey, lastUserMessages, messages), so you can test with a forged conversation.'
        ),
    })
  )
  .output(draftRunResultSchema)
  .mutation(async ({ input: { typebotId, variables }, ctx: { user } }) => {
    const existingTypebot = await prisma.typebot.findFirst({
      where: { id: typebotId },
      include: {
        collaborators: true,
        workspace: {
          select: {
            name: true,
            id: true,
            isSuspended: true,
            isPastDue: true,
            members: { select: { userId: true, role: true } },
          },
        },
      },
    })
    if (
      !existingTypebot?.id ||
      (await isWriteTypebotForbidden(existingTypebot, user))
    ) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Typebot with ID: ${typebotId} not found or access forbidden. User: ${user.id}`,
      })
    }

    const flowType = settingsSchema.parse(existingTypebot.settings ?? {})
      .general?.type
    if (flowType !== 'TOOL' && flowType !== 'CONTEXT_ENRICHMENT') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Typebot ${typebotId} is a conversational flow. Only TOOL and CONTEXT_ENRICHMENT flows can be run headlessly; conversational flows are tested in the builder preview.`,
      })
    }

    let draft
    try {
      draft = startTypebotSchema.parse(existingTypebot)
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to parse typebot with ID: ${typebotId}`,
        cause: err,
      })
    }

    return executeDraftWorkflow({
      typebot: draft,
      userId: user.id,
      prefilledVariables: variables,
    })
  })
