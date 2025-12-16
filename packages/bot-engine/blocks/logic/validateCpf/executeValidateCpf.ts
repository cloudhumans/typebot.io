import { ValidateCpfBlock, SessionState } from '@typebot.io/schemas'
import { ExecuteLogicResponse } from '../../../types'
import { updateVariablesInSession } from '@typebot.io/variables/updateVariablesInSession'
import { byId } from '@typebot.io/lib'
import { createId } from '@paralleldrive/cuid2'

export const executeValidateCpf = (
  state: SessionState,
  block: ValidateCpfBlock
): ExecuteLogicResponse => {
  const { variables } = state.typebotsQueue[0].typebot

  if (!block.options?.inputVariableId) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  const inputVariable = variables.find(byId(block.options.inputVariableId))
  if (!inputVariable || !inputVariable.value) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  const cpfValue = inputVariable.value.toString()

  // Remove formatação se solicitado
  const cleanCpf = block.options.removeFormatting
    ? cpfValue.replace(/[^\d]/g, '')
    : cpfValue

  // Verifica se é um CNPJ (14 dígitos) no bloco de CPF
  if (cleanCpf.length === 14) {
    return {
      outgoingEdgeId: undefined,
      logs: [
        {
          status: 'error',
          description:
            '⚠️ Este parece ser um CNPJ (14 dígitos). Use o bloco "Validar CNPJ" para validar CNPJs.',
        },
      ],
    }
  }

  // Validação do CPF
  const isValid = validateCpfNumber(cleanCpf)

  const variablesToUpdate: { id: string; value: any }[] = []

  // Procurar variável de resultado baseada no nome da variável de entrada
  const inputVariableName = inputVariable?.name || 'CPF'
  const resultVariableName = `${inputVariableName}_valido`
  let resultVariable = variables.find((v) => v.name === resultVariableName)

  // Se encontrou a variável, atualizar com o resultado
  if (resultVariable) {
    variablesToUpdate.push({
      id: resultVariable.id,
      value: isValid,
    })
  }

  // Atualizar variável de saída com CPF limpo (se configurada e remoção ativada)
  if (block.options.outputVariableId && block.options.removeFormatting) {
    variablesToUpdate.push({
      id: block.options.outputVariableId,
      value: cleanCpf,
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

function validateCpfNumber(cpf: string): boolean {
  // Remove formatação
  cpf = cpf.replace(/[^\d]/g, '')

  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false

  // Calcula os dígitos verificadores
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i)
  }
  let remainder = 11 - (sum % 11)
  let digit1 = remainder >= 10 ? 0 : remainder

  if (parseInt(cpf.charAt(9)) !== digit1) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i)
  }
  remainder = 11 - (sum % 11)
  let digit2 = remainder >= 10 ? 0 : remainder

  return parseInt(cpf.charAt(10)) === digit2
}
