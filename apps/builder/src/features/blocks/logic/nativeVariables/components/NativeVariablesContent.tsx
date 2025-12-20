import { Text } from '@chakra-ui/react'
import {
  NativeVariablesBlock,
  nativeVariableTypes,
} from '@typebot.io/schemas/features/blocks/inputs/nativeVariables'

type Props = {
  block: NativeVariablesBlock
}

export const NativeVariablesContent = ({ block }: Props) => {
  const nativeType = nativeVariableTypes.find(
    (type) => type.value === block.options?.nativeType
  )

  if (!nativeType) {
    return (
      <Text color={'gray.500'} fontSize="sm">
        Configurar variável nativa
      </Text>
    )
  }

  return (
    <Text color={'gray.500'} fontSize="sm">
      {nativeType.value}
    </Text>
  )
}
