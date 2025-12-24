import React from 'react'
import { useTranslate } from '@tolgee/react'
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
  const { t } = useTranslate()
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
      <Text fontWeight="semibold">
        {t('blocks.logic.validateCnpj.configure.label')}
      </Text>

      <Stack>
        <Text fontSize="sm">
          {t('blocks.logic.validateCnpj.inputVariable.label')}
        </Text>
        <VariableSearchInput
          initialVariableId={options?.inputVariableId}
          onSelectVariable={handleInputVariableChange}
          placeholder="Selecione a variável..."
        />
      </Stack>

      {resultVariableName && (
        <Stack>
          <Text fontSize="sm" color="orange.600">
            {t('blocks.logic.validateCnpj.manualVariableWarning')}{' '}
            <strong>{resultVariableName}</strong>
          </Text>
          <Text fontSize="xs" color="gray.500">
            {t('blocks.logic.validateCnpj.manualVariableDescription')}
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
