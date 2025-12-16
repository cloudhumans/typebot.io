import React from 'react'
import { Stack, Text } from '@chakra-ui/react'
import { ValidateCnpjOptions } from '@typebot.io/schemas/features/blocks/logic/validateCnpj'
import { VariableSearchInput } from '@/components/inputs/VariableSearchInput'
import { SwitchWithLabel } from '@/components/inputs/SwitchWithLabel'
import { Variable } from '@typebot.io/schemas'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'

type Props = {
  options: ValidateCnpjOptions | undefined
  onOptionsChange: (options: ValidateCnpjOptions) => void
}

export const ValidateCnpjSettings = ({ options, onOptionsChange }: Props) => {
  const { typebot } = useTypebot()

  const handleInputVariableChange = (variable?: Variable) => {
    onOptionsChange({ ...options, inputVariableId: variable?.id })
  }

  const handleOutputVariableChange = (variable?: Variable) => {
    onOptionsChange({ ...options, outputVariableId: variable?.id })
  }

  const handleRemoveFormattingChange = (removeFormatting: boolean) => {
    onOptionsChange({ ...options, removeFormatting })
  }

  const inputVariableName = options?.inputVariableId
    ? typebot?.variables.find((v) => v.id === options.inputVariableId)?.name
    : undefined

  const resultVariableName = inputVariableName
    ? `${inputVariableName}_valido`
    : undefined

  return (
    <Stack spacing={4}>
      <Text fontWeight="semibold">Configurações de Validação de CNPJ</Text>

      <Stack>
        <Text fontSize="sm">Variável com CNPJ para validar:</Text>
        <VariableSearchInput
          initialVariableId={options?.inputVariableId}
          onSelectVariable={handleInputVariableChange}
          placeholder="Selecione a variável..."
        />
      </Stack>

      {resultVariableName && (
        <Stack>
          <Text fontSize="sm" color="orange.600">
            ⚠️ Você deve criar manualmente a variável:{' '}
            <strong>{resultVariableName}</strong>
          </Text>
          <Text fontSize="xs" color="gray.500">
            Esta variável receberá true (CNPJ válido) ou false (CNPJ inválido)
          </Text>
        </Stack>
      )}

      <Stack>
        <Text fontSize="sm">Salvar CNPJ limpo em:</Text>
        <VariableSearchInput
          initialVariableId={options?.outputVariableId}
          onSelectVariable={handleOutputVariableChange}
          placeholder="Escolha onde salvar CNPJ limpo..."
        />
      </Stack>

      <SwitchWithLabel
        label="Remover formatação (pontos, barras e hífen)"
        initialValue={options?.removeFormatting ?? true}
        onCheckChange={handleRemoveFormattingChange}
      />
    </Stack>
  )
}
