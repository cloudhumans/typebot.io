import { safeStringify } from '@typebot.io/lib/safeStringify'
import { Variable, VariableWithUnknowValue } from './types'
import { SessionState, SetVariableHistoryItem } from '../schemas'

type Props = {
  state: SessionState
  newVariables: VariableWithUnknowValue[]
  currentBlockId: string | undefined
}
export const updateVariablesInSession = ({
  state,
  newVariables,
  currentBlockId,
}: Props): {
  updatedState: SessionState
  newSetVariableHistory: SetVariableHistoryItem[]
} => {
  const { updatedVariables, newSetVariableHistory, setVariableHistoryIndex } =
    updateTypebotVariables({
      state,
      newVariables,
      currentBlockId,
    })

  // Real JS type of each value, captured here because this is the last place it
  // exists: `updateTypebotVariables` runs everything through `safeStringify`, so
  // 5, true and { a: 1 } become text and the type is gone for good. Arrays read
  // 'object', same as `typeof` in a Code block. Preview-only, like
  // `setVariableHistory` below — it feeds the builder debug panel, which
  // otherwise could only guess the type back from the stored string.
  const newVariableTypes = Object.fromEntries(
    newVariables.map((variable) => [variable.id, typeof variable.value])
  )

  return {
    updatedState: {
      ...state,
      currentSetVariableHistoryIndex: setVariableHistoryIndex,
      typebotsQueue: state.typebotsQueue.map((typebotInQueue, index: number) =>
        index === 0
          ? {
              ...typebotInQueue,
              typebot: {
                ...typebotInQueue.typebot,
                variables: updatedVariables,
              },
            }
          : typebotInQueue
      ),
      previewMetadata: state.typebotsQueue[0].resultId
        ? state.previewMetadata
        : {
            ...state.previewMetadata,
            setVariableHistory: (
              state.previewMetadata?.setVariableHistory ?? []
            ).concat(newSetVariableHistory),
            // Latest write wins, so the map always describes the value the
            // variable holds *now*: a variable that starts as a string and is
            // later overwritten with a number reports 'number' from then on.
            variableTypes: {
              ...state.previewMetadata?.variableTypes,
              ...newVariableTypes,
            },
          },
    },
    newSetVariableHistory,
  }
}

const updateTypebotVariables = ({
  state,
  newVariables,
  currentBlockId,
}: {
  state: SessionState
  newVariables: VariableWithUnknowValue[]
  currentBlockId: string | undefined
}): {
  updatedVariables: Variable[]
  newSetVariableHistory: SetVariableHistoryItem[]
  setVariableHistoryIndex: number
} => {
  const serializedNewVariables = newVariables.map((variable) => ({
    ...variable,
    value: Array.isArray(variable.value)
      ? variable.value.map(safeStringify)
      : safeStringify(variable.value),
  }))

  let setVariableHistoryIndex = state.currentSetVariableHistoryIndex ?? 0
  const setVariableHistory: SetVariableHistoryItem[] = []
  if (currentBlockId) {
    serializedNewVariables
      .filter((v) => state.setVariableIdsForHistory?.includes(v.id))
      .forEach((newVariable) => {
        setVariableHistory.push({
          resultId: state.typebotsQueue[0].resultId as string,
          index: setVariableHistoryIndex,
          blockId: currentBlockId,
          variableId: newVariable.id,
          value: newVariable.value,
        })
        setVariableHistoryIndex += 1
      })
  }

  return {
    updatedVariables: [
      ...state.typebotsQueue[0].typebot.variables.filter((existingVariable) =>
        serializedNewVariables.every(
          (newVariable) => existingVariable.id !== newVariable.id
        )
      ),
      ...serializedNewVariables,
    ],
    newSetVariableHistory: setVariableHistory,
    setVariableHistoryIndex,
  }
}
