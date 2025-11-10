import { ExecuteLogicResponse } from '../../../types'
import { SessionState, WaitBlock } from '@typebot.io/schemas'
import { parseVariables } from '@typebot.io/variables/parseVariables'
import { isNotDefined } from '@typebot.io/lib'

const sleep = (seconds: number) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000))

export const executeWait = async (
  state: SessionState,
  block: WaitBlock
): Promise<ExecuteLogicResponse> => {
  const { variables } = state.typebotsQueue[0].typebot

  if (!block.options?.secondsToWaitFor) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  const parsedSecondsToWaitFor = safeParseFloat(
    parseVariables(variables)(block.options.secondsToWaitFor)
  )

  if (isNotDefined(parsedSecondsToWaitFor)) {
    return { outgoingEdgeId: block.outgoingEdgeId }
  }

  if (parsedSecondsToWaitFor > 0) {
    console.log(`⏳ aguardando ${parsedSecondsToWaitFor}s no servidor...`)
    await sleep(parsedSecondsToWaitFor)
    console.log('✅ continuação do fluxo após espera')
  }

  return {
    outgoingEdgeId: block.outgoingEdgeId,
  }
}

const safeParseFloat = (value: string) => {
  const parsedValue = parseFloat(value)
  return isNaN(parsedValue) ? undefined : parsedValue
}
