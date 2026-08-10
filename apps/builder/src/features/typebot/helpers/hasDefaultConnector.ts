import { isDefined } from '@typebot.io/lib'
import {
  isChoiceInput,
  isConditionBlock,
  isPictureChoiceInput,
} from '@typebot.io/schemas/helpers'
import { BlockV6 } from '@typebot.io/schemas'
import { InputBlockType } from '@typebot.io/schemas/features/blocks/inputs/constants'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'

const CLAUDIA_BLOCK_TYPE = 'claudia'

export const hasDefaultConnector = (block: BlockV6) => {
  // ClaudIA custom block should never connect to other cards
  if (block.type === CLAUDIA_BLOCK_TYPE) return false

  return (
    (!isChoiceInput(block) &&
      !isPictureChoiceInput(block) &&
      !isConditionBlock(block) &&
      block.type !== LogicBlockType.AB_TEST) ||
    (block.type === InputBlockType.CHOICE &&
      isDefined(block.options?.dynamicVariableId)) ||
    (block.type === InputBlockType.PICTURE_CHOICE &&
      block.options?.dynamicItems?.isEnabled &&
      block.options.dynamicItems.pictureSrcsVariableId)
  )
}
