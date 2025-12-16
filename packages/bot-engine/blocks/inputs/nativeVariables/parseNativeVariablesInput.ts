import { NativeVariablesBlock, SessionState } from '@typebot.io/schemas'
import { deepParseVariables } from '@typebot.io/variables/deepParseVariables'
import { getPrefilledInputValue } from '../../../getPrefilledValue'

export const parseNativeVariablesInput =
  (state: SessionState) => (block: NativeVariablesBlock) => {
    const variables = state.typebotsQueue[0].typebot.variables

    return {
      ...deepParseVariables(variables, { removeEmptyStrings: true })({
        ...block,
        prefilledValue: getPrefilledInputValue(variables)(block),
      }),
    }
  }
