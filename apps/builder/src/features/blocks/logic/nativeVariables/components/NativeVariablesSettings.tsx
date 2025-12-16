import React from 'react'
import { Stack, Text, Select } from '@chakra-ui/react'
import {
  NativeVariablesOptions,
  nativeVariableTypes,
} from '@typebot.io/schemas/features/blocks/logic/nativeVariables'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { createId } from '@paralleldrive/cuid2'

type Props = {
  options: NativeVariablesOptions | undefined
  onOptionsChange: (options: NativeVariablesOptions) => void
}

export const NativeVariablesSettings = ({
  options,
  onOptionsChange,
}: Props) => {
  const { createVariable } = useTypebot()

  const handleNativeTypeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const nativeType = event.target.value as
      | 'helpdeskId'
      | 'cloudChatId'
      | 'activeIntent'
      | 'channelType'
      | 'createdAt'
      | 'lastUserMessages'
      | 'messages'

    // Criar variável automaticamente
    const variableId = 'v' + createId()
    createVariable({
      id: variableId,
      name: nativeType,
      isSessionVariable: true,
    })

    onOptionsChange({
      ...options,
      nativeType,
      variableId,
    })
  }

  return (
    <Stack spacing={4}>
      <Text fontWeight="semibold">Configurações de Variáveis Nativas</Text>

      <Stack>
        <Text fontSize="sm">Tipo de variável nativa:</Text>
        <Select
          value={options?.nativeType || 'helpdeskId'}
          onChange={handleNativeTypeChange}
          placeholder="Selecione o tipo..."
        >
          {nativeVariableTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
      </Stack>

      {options?.nativeType && (
        <Stack>
          <Text fontSize="sm" color="gray.600">
            📌 Variável criada: <strong>{`{${options.nativeType}}`}</strong>
          </Text>
          <Text fontSize="xs" color="gray.500">
            Fonte:{' '}
            {
              nativeVariableTypes.find((t) => t.value === options.nativeType)
                ?.label
            }
          </Text>
        </Stack>
      )}
    </Stack>
  )
}
