import { SessionState } from '@typebot.io/schemas'
import { OpenAIBlock } from '@typebot.io/schemas/features/blocks/integrations/openai'
import { createChatCompletionOpenAI } from './createChatCompletionOpenAI'
import { ExecuteIntegrationResponse } from '../../../../types'
import { createSpeechOpenAI } from './audio/createSpeechOpenAI'

export const executeOpenAIBlock = async (
  state: SessionState,
  block: OpenAIBlock,
  sessionId?: string
): Promise<ExecuteIntegrationResponse> => {
  switch (block.options?.task) {
    case 'Create chat completion':
      return createChatCompletionOpenAI(state, {
        options: block.options,
        outgoingEdgeId: block.outgoingEdgeId,
        blockId: block.id,
        sessionId,
      })
    case 'Create speech':
      return createSpeechOpenAI(state, {
        options: block.options,
        outgoingEdgeId: block.outgoingEdgeId,
        blockId: block.id,
        sessionId,
      })
    case 'Create image':
    case undefined:
      return { outgoingEdgeId: block.outgoingEdgeId }
  }
}
