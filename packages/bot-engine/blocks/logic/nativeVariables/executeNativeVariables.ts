import { NativeVariablesBlock, SessionState } from '@typebot.io/schemas'
import { updateVariablesInSession } from '@typebot.io/variables/updateVariablesInSession'
import { ExecuteLogicResponse } from '../../types'

export const executeNativeVariables = (
  state: SessionState,
  block: NativeVariablesBlock
): ExecuteLogicResponse => {
  if (!block.options?.nativeType || !block.options?.variableId) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  // Obter o valor da variável nativa baseado no tipo
  const nativeValue = getNativeVariableValue(state, block.options.nativeType)

  // Encontrar a variável existente
  const variables = state.typebotsQueue[0].typebot.variables
  const existingVariable = variables.find(
    (v) => v.id === block.options.variableId
  )

  if (!existingVariable) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  // Atualizar a variável existente com o valor nativo
  const updatedVariable = {
    ...existingVariable,
    value: nativeValue,
  }

  const { updatedState } = updateVariablesInSession({
    state,
    newVariables: [updatedVariable],
    currentBlockId: block.id,
  })

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    newSessionState: updatedState,
  }
}

const getNativeVariableValue = (
  state: SessionState,
  nativeType: string
): string | undefined => {
  // Implementar a lógica para obter os valores das variáveis nativas
  // baseado no contexto da sessão

  switch (nativeType) {
    case 'helpdeskId':
      return state.previewMetadata?.helpdeskId || 'HD' + Date.now()
    case 'cloudChatId':
      return state.previewMetadata?.cloudChatId || 'CC' + Date.now()
    case 'activeIntent':
      return state.previewMetadata?.activeIntent || 'default_intent'
    case 'channelType':
      return state.previewMetadata?.channelType || 'web'
    case 'createdAt':
      return new Date().toISOString()
    case 'lastUserMessages':
      // Implementar lógica para pegar as últimas mensagens do usuário
      return JSON.stringify([])
    case 'messages':
      // Implementar lógica para pegar todas as mensagens
      return JSON.stringify([])
    default:
      return undefined
  }
}
