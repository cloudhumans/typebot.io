import { ValidateCnpjBlock, SessionState } from '@typebot.io/schemas'
import { ExecuteLogicResponse } from '../../../types'
import { updateVariablesInSession } from '@typebot.io/variables/updateVariablesInSession'
import { byId } from '@typebot.io/lib'
import { createId } from '@paralleldrive/cuid2'

export const executeValidateCnpj = (
  state: SessionState,
  block: ValidateCnpjBlock
): ExecuteLogicResponse => {
  const { variables } = state.typebotsQueue[0].typebot

  if (!block.options?.inputVariableId) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  const inputVariable = variables.find(byId(block.options.inputVariableId))
  if (!inputVariable || !inputVariable.value) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  const cnpjValue = inputVariable.value.toString()

  // Remove formatação se solicitado
  const cleanCnpj = block.options.removeFormatting
    ? cnpjValue.replace(/[^\d]/g, '')
    : cnpjValue

  // Verifica se é um CPF (11 dígitos) no bloco de CNPJ
  if (cleanCnpj.length === 11) {
    return {
      outgoingEdgeId: undefined,
      logs: [
        {
          status: 'error',
          description:
            '⚠️ Este parece ser um CPF (11 dígitos). Use o bloco "Validar CPF" para validar CPFs.',
        },
      ],
    }
  }

  // Validação do CNPJ
  const isValid = validateCnpjNumber(cleanCnpj)

  const variablesToUpdate: { id: string; value: any }[] = []

  // Procurar variável de resultado baseada no nome da variável de entrada
  const inputVariableName = inputVariable?.name || 'CNPJ'
  const resultVariableName = `${inputVariableName}_valido`
  let resultVariable = variables.find((v) => v.name === resultVariableName)

  // Se encontrou a variável, atualizar com o resultado
  if (resultVariable) {
    variablesToUpdate.push({
      id: resultVariable.id,
      value: isValid,
    })
  }

  // Atualizar variável de saída com CNPJ limpo (se configurada e remoção ativada)
  if (block.options.outputVariableId && block.options.removeFormatting) {
    variablesToUpdate.push({
      id: block.options.outputVariableId,
      value: cleanCnpj,
    })
  }

  let newSessionState = state

  if (variablesToUpdate.length > 0) {
    const updateResults = updateVariablesInSession({
      newVariables: variablesToUpdate.map((v) => ({
        ...variables.find(byId(v.id))!,
        value: v.value,
      })),
      state,
      currentBlockId: block.id,
    })

    if (updateResults) {
      newSessionState = updateResults.updatedState
    }
  }

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    newSessionState,
  }
}

function validateCnpjNumber(cnpj: string): boolean {
  // Remove formatação
  cnpj = cnpj.replace(/[^\d]/g, '')

  // Verifica se tem 14 dígitos
  if (cnpj.length !== 14) return false

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  // Calcula o primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights1[i]
  }
  let remainder = sum % 11
  let digit1 = remainder < 2 ? 0 : 11 - remainder

  if (parseInt(cnpj.charAt(12)) !== digit1) return false

  // Calcula o segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  sum = 0
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights2[i]
  }
  remainder = sum % 11
  let digit2 = remainder < 2 ? 0 : 11 - remainder

  return parseInt(cnpj.charAt(13)) === digit2
}
