import React from 'react'
import { Stack, Text } from '@chakra-ui/react'
import { ValidateCpfOptions } from '@typebot.io/schemas/features/blocks/logic/validateCpf'
import { VariableSearchInput } from '@/components/inputs/VariableSearchInput'
import { SwitchWithLabel } from '@/components/inputs/SwitchWithLabel'
import { Variable } from '@typebot.io/schemas'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'

type Props = {
  options: ValidateCpfOptions | undefined
  onOptionsChange: (options: ValidateCpfOptions) => void
}

export const ValidateCpfSettings = ({ options, onOptionsChange }: Props) => {
  const { typebot } = useTypebot()

  const handleInputVariableChange = (variable?: Variable) => {
    onOptionsChange({
      ...options,
      inputVariableId: variable?.id,
      removeFormatting: options?.removeFormatting ?? true,
    })
  }

  const handleOutputVariableChange = (variable?: Variable) => {
    onOptionsChange({
      ...options,
      outputVariableId: variable?.id,
      removeFormatting: options?.removeFormatting ?? true,
    })
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
      <Text fontWeight="semibold">Configurações de Validação de CPF</Text>

      <Stack>
        <Text fontSize="sm">Variável com CPF para validar:</Text>
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
            Esta variável receberá true (CPF válido) ou false (CPF inválido)
          </Text>
        </Stack>
      )}

      <Stack>
        <Text fontSize="sm">Salvar CPF limpo em:</Text>
        <VariableSearchInput
          initialVariableId={options?.outputVariableId}
          onSelectVariable={handleOutputVariableChange}
          placeholder="Escolha onde salvar CPF limpo..."
        />
      </Stack>

      <SwitchWithLabel
        label="Remover formatação (pontos e hífen)"
        initialValue={options?.removeFormatting ?? true}
        onCheckChange={handleRemoveFormattingChange}
      />
    </Stack>
  )
}
