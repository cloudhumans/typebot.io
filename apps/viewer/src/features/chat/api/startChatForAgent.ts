import { authenticatedProcedure } from '@/helpers/server/trpc'
import {
  startChatForAgentInputSchema,
  startChatForAgentResponseSchema,
} from '@typebot.io/schemas/features/chat/schema'
import { startChatForAgent as startChatForAgentFn } from '@typebot.io/bot-engine/apiHandlers/startChatForAgent'
import logger from '@/helpers/logger'

export const startChatForAgent = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/agent/typebots/{publicId}/startChat',
      summary: 'Start chat for AI agent',
      description:
        'Agent-specific endpoint that validates required input variables before starting a chat. Returns declared variables from DECLARE_VARIABLES blocks.',
      protect: true,
      tags: ['Agent'],
    },
  })
  .input(startChatForAgentInputSchema)
  .output(startChatForAgentResponseSchema)
  .mutation(async ({ input }) => {
    logger.info('startChatForAgent API endpoint called', {
      publicId: input.publicId,
      hasPrefilledVariables: !!input.prefilledVariables,
      providedVariableCount: Object.keys(input.prefilledVariables ?? {}).length,
      hasResultId: !!input.resultId,
    })

    try {
      const response = await startChatForAgentFn(input)

      logger.info('startChatForAgent API endpoint completed', {
        publicId: input.publicId,
        sessionId: response.sessionId,
        requiredInputCount: response.requiredInputs.length,
        providedInputCount: response.providedInputs.length,
        resultId: response.resultId,
      })

      return response
    } catch (error) {
      logger.error('Error in startChatForAgent API endpoint', {
        publicId: input.publicId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  })
