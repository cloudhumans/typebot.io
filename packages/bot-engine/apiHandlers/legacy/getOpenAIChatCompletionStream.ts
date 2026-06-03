import { decryptV2 } from '@typebot.io/lib/api/encryption/decryptV2'
import { isNotEmpty } from '@typebot.io/lib/utils'
import {
  ChatCompletionOpenAIOptions,
  OpenAICredentials,
} from '@typebot.io/schemas/features/blocks/integrations/openai'
import { SessionState } from '@typebot.io/schemas/features/chat/sessionState'
import { OpenAIStream } from 'ai'
import { parseVariableNumber } from '@typebot.io/variables/parseVariableNumber'
import { ClientOptions, OpenAI } from 'openai'
import { defaultOpenAIOptions } from '@typebot.io/schemas/features/blocks/integrations/openai/constants'
import { getCredentials } from '../../queries/getCredentials'
import logger from '@typebot.io/lib/logger'

export const getOpenAIChatCompletionStream = async (
  state: SessionState,
  options: ChatCompletionOpenAIOptions,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ctx?: { sessionId?: string; blockId?: string }
) => {
  if (!options.credentialsId) {
    const typebot = state.typebotsQueue[0]?.typebot
    logger.warn('No credentialsId configured on block', {
      typebotId: typebot?.typebotId,
      workspaceId: typebot?.workspaceId,
      workspaceName: typebot?.workspaceName,
      sessionId: ctx?.sessionId,
      blockId: ctx?.blockId,
      blockType: 'legacy.openai.api_handler_stream',
    })
    return
  }
  const credentials = await getCredentials(options.credentialsId)
  if (!credentials) {
    const typebot = state.typebotsQueue[0]?.typebot
    logger.error('Could not find credentials in database', {
      credentialsId: options.credentialsId,
      typebotId: typebot?.typebotId,
      workspaceId: typebot?.workspaceId,
      workspaceName: typebot?.workspaceName,
      sessionId: ctx?.sessionId,
      blockId: ctx?.blockId,
      blockType: 'legacy.openai.api_handler_stream',
    })
    return
  }
  const { apiKey } = (await decryptV2(
    credentials.data,
    credentials.iv
  )) as OpenAICredentials['data']

  const { typebot } = state.typebotsQueue[0]
  const temperature = parseVariableNumber(typebot.variables)(
    options.advancedSettings?.temperature
  )

  const config = {
    apiKey,
    baseURL: options.baseUrl,
    defaultHeaders: {
      'api-key': apiKey,
    },
    defaultQuery: isNotEmpty(options.apiVersion)
      ? {
          'api-version': options.apiVersion,
        }
      : undefined,
  } satisfies ClientOptions

  const openai = new OpenAI(config)

  const response = await openai.chat.completions.create({
    model: options.model ?? defaultOpenAIOptions.model,
    temperature,
    stream: true,
    messages,
  })

  return OpenAIStream(response)
}
