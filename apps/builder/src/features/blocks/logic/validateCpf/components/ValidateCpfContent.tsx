import { Text } from '@chakra-ui/react'
import { useTranslate } from '@tolgee/react'
import { ValidateCpfBlock } from '@typebot.io/schemas/features/blocks/logic/validateCpf'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { byId } from '@typebot.io/lib'

type Props = {
  block: ValidateCpfBlock
}

export const ValidateCpfContent = ({ block }: Props) => {
  const { t } = useTranslate()
  const { typebot } = useTypebot()
  const inputVarName =
    typebot?.variables.find(byId(block.options?.inputVariableId))?.name ?? ''

  if (!inputVarName) {
    return (
      <Text color={'gray.500'} fontSize="sm">
        {t('blocks.logic.validateCpf.configure.label')}
      </Text>
    )
  }
  //  TODO TRANSFORMAR ESSA VARIAVEL EM UMA CONSTANTE GLOBAL
  const resultVarName = `${inputVarName}_valido`

  return (
    <Text color={'gray.500'} fontSize="sm">
      {t('blocks.logic.validateCpf.label')}: {inputVarName} → {resultVarName}
    </Text>
  )
}
