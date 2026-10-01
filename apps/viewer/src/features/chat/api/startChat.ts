import { authenticatedProcedure } from '@/helpers/server/trpc'
import {
  startChatInputSchema,
  startChatResponseSchema,
} from '@typebot.io/schemas/features/chat/schema'
import { startChat as startChatFn } from '@typebot.io/bot-engine/apiHandlers/startChat'
import logger from '@/helpers/logger'
import { logFailureOnce } from '@typebot.io/lib/datadogError'

export const startChat = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{publicId}/startChat',
      summary: 'Start chat',
      protect: true,
    },
  })
  .input(startChatInputSchema)
  .output(startChatResponseSchema)
  .mutation(async ({ input, ctx: { origin, res } }) => {
    logger.info('startChat API endpoint called', {
      publicId: input.publicId,
      hasMessage: !!input.message,
      isOnlyRegistering: input.isOnlyRegistering,
      isStreamEnabled: input.isStreamEnabled,
      hasPrefilledVariables: !!input.prefilledVariables,
      hasResultId: !!input.resultId,
      textBubbleContentFormat: input.textBubbleContentFormat,
      origin,
    })

    try {
      const { corsOrigin, ...response } = await startChatFn({
        ...input,
        origin,
      })

      logger.info('startChat API endpoint completed', {
        publicId: input.publicId,
        sessionId: response.sessionId,
        hasMessages: !!response.messages && response.messages.length > 0,
        hasInput: !!response.input,
        resultId: response.resultId,
        corsOrigin,
      })

      if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin)
      return response
    } catch (error) {
      logFailureOnce(
        logger,
        'Error in startChat API endpoint',
        { publicId: input.publicId, origin },
        error
      )
      throw error
    }
  })
