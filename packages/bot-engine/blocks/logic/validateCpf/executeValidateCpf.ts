import { ValidateCpfBlock, SessionState, Variable } from '@typebot.io/schemas'
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
          description: `⚠️ This appears to be a CNPJ (14 digits). Use the "Validate CNPJ" block to validate CNPJs.`,
        },
      ],
    }
  }

  // Validação do CPF
  const isValid = validateCpfNumber(cleanCpf)

  const variablesToUpdate: { id: string; value: boolean | string }[] = []

  // Use a fixed variable name for validation result
  //  TODO TRANSFORMAR ESSA VARIAVEL EM UMA CONSTANTE GLOBAL

  const resultVariableName = 'cpf_valido'
  let resultVariable = variables.find((v) => v.name === resultVariableName)

  // Se não encontrou a variável, criar uma nova
  if (!resultVariable) {
    resultVariable = {
      id: createId(),
      name: resultVariableName,
      value: isValid.toString(),
    } as Variable
  }

  // Atualizar variável de resultado com o resultado da validação
  if (resultVariable) {
    variablesToUpdate.push({
      id: resultVariable.id,
      value: isValid.toString(),
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

  // Se criamos uma nova variável, adicioná-la ao estado primeiro
  if (!variables.find((v) => v.name === resultVariableName)) {
    newSessionState = {
      ...state,
      typebotsQueue: [
        {
          ...state.typebotsQueue[0],
          typebot: {
            ...state.typebotsQueue[0].typebot,
            variables: [...variables, resultVariable!],
          },
        },
        ...state.typebotsQueue.slice(1),
      ],
    }
  }

  if (variablesToUpdate.length > 0) {
    const validVariables = variablesToUpdate
      .map((v) => {
        const variable =
          newSessionState.typebotsQueue[0].typebot.variables.find(byId(v.id))
        if (!variable) return null
        return {
          ...variable,
          value: v.value,
        }
      })
      .filter(
        (variable): variable is NonNullable<typeof variable> =>
          variable !== null
      )

    const updateResults = updateVariablesInSession({
      newVariables: validVariables,
      state: newSessionState,
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
