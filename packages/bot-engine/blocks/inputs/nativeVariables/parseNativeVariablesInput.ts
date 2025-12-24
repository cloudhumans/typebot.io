import {
  NativeVariablesBlock,
  SessionState,
  Variable,
} from '@typebot.io/schemas'
import { deepParseVariables } from '@typebot.io/variables/deepParseVariables'
import { getPrefilledInputValue } from '../../../getPrefilledValue'

export const parseNativeVariablesInput =
  (state: SessionState) => (block: NativeVariablesBlock) => {
    const variables = state.typebotsQueue[0].typebot.variables

    if (!block.options?.nativeType || !block.options?.variableId) {
      return deepParseVariables(variables, { removeEmptyStrings: true })({
        ...block,
        prefilledValue: getPrefilledInputValue(variables)(block),
      })
    }

    // Coletar o valor nativo automaticamente
    const nativeValue = getNativeValue(state, block.options.nativeType)

    // Encontrar e atualizar a variável diretamente
    const targetVariable = variables.find(
      (v) => v.id === block.options?.variableId
    )
    if (targetVariable) {
      targetVariable.value = nativeValue
    }

    return deepParseVariables(variables, { removeEmptyStrings: true })({
      ...block,
      prefilledValue: nativeValue,
    })
  }

// Função para obter valor nativo da sessão
const getNativeValue = (state: SessionState, nativeType: string): string => {
  switch (nativeType) {
    case 'helpdeskId':
      // Busca helpdesk ID nos headers ou na sessão
      return state.whatsApp?.contact?.phoneNumber || 'web-user-' + Date.now()
    case 'cloudChatId':
      // Busca cloud chat ID na sessão
      return (
        state.whatsApp?.contact?.name || state.currentBlockId || 'anonymous'
      )
    case 'activeIntent':
      // Busca intent ativo baseado na última resposta
      const lastAnswer = state.typebotsQueue[0]?.answers?.slice(-1)[0]
      return lastAnswer?.key || 'no-intent'
    case 'channelType':
      return state.whatsApp ? 'whatsapp' : 'web'
    case 'createdAt':
      return new Date().toISOString()
    case 'lastUserMessages':
      // Busca as últimas mensagens das respostas
      const lastAnswers = state.typebotsQueue[0]?.answers?.slice(-3) || []
      return JSON.stringify(lastAnswers.map((a) => a.value))
    case 'messages':
      // Busca todas as mensagens/respostas da sessão
      const allAnswers = state.typebotsQueue[0]?.answers || []
      return JSON.stringify(allAnswers.map((a) => a.value))
    default:
      return 'unknown'
  }
}
