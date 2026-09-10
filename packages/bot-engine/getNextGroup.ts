import { byId, isDefined, isNotDefined } from '@typebot.io/lib'
import { Group, SessionState, VariableWithValue } from '@typebot.io/schemas'
import { upsertResult } from './queries/upsertResult'
import { VisitedEdge } from '@typebot.io/prisma'

export type NextGroup = {
  group?: Group
  newSessionState: SessionState
  visitedEdge?: VisitedEdge
}

export const getNextGroup = async ({
  state,
  edgeId,
  isOffDefaultPath,
}: {
  state: SessionState
  edgeId?: string
  isOffDefaultPath: boolean
}): Promise<NextGroup> => {
  const nextEdge = state.typebotsQueue[0].typebot.edges.find(byId(edgeId))
  if (!nextEdge) {
    if (state.typebotsQueue.length > 1) {
      const nextEdgeId = state.typebotsQueue[0].edgeIdToTriggerWhenDone
      const isMergingWithParent = state.typebotsQueue[0].isMergingWithParent
      const currentResultId = state.typebotsQueue[0].resultId
      if (!isMergingWithParent && currentResultId)
        await upsertResult({
          resultId: currentResultId,
          typebot: state.typebotsQueue[0].typebot,
          isCompleted: true,
          hasStarted: state.typebotsQueue[0].answers.length > 0,
        })
      let newSessionState = {
        ...state,
        typebotsQueue: [
          {
            ...state.typebotsQueue[1],
            typebot: isMergingWithParent
              ? {
                  ...state.typebotsQueue[1].typebot,
                  variables: state.typebotsQueue[1].typebot.variables
                    .map((variable) => ({
                      ...variable,
                      value:
                        state.typebotsQueue[0].typebot.variables.find(
                          (v) => v.name === variable.name
                        )?.value ?? variable.value,
                    }))
                    .concat(
                      state.typebotsQueue[0].typebot.variables.filter(
                        (variable) =>
                          isDefined(variable.value) &&
                          isNotDefined(
                            state.typebotsQueue[1].typebot.variables.find(
                              (v) => v.name === variable.name
                            )
                          )
                      ) as VariableWithValue[]
                    ),
                }
              : state.typebotsQueue[1].typebot,
            answers: isMergingWithParent
              ? [
                  ...state.typebotsQueue[1].answers.filter(
                    (incomingAnswer) =>
                      !state.typebotsQueue[0].answers.find(
                        (currentAnswer) =>
                          currentAnswer.key === incomingAnswer.key
                      )
                  ),
                  ...state.typebotsQueue[0].answers,
                ]
              : state.typebotsQueue[1].answers,
          },
          ...state.typebotsQueue.slice(2),
        ],
      } satisfies SessionState
      if (state.progressMetadata)
        newSessionState.progressMetadata = {
          ...state.progressMetadata,
          totalAnswers:
            state.progressMetadata.totalAnswers +
            state.typebotsQueue[0].answers.length,
        }
      // The merge above hands the parent's variables the linked typebot's values,
      // matched by *name* while each side keeps its own id. The captured value
      // type is keyed by id, so it has to follow the same path or the debug panel
      // would describe the parent's stale value — or fall back to the stored text
      // type — for a value the linked typebot actually wrote. Only reached in
      // preview: `variableTypes` is only ever recorded when there is no resultId.
      const capturedTypes = newSessionState.previewMetadata?.variableTypes
      if (capturedTypes) {
        const inheritedTypes = isMergingWithParent
          ? Object.fromEntries(
              newSessionState.typebotsQueue[0].typebot.variables.flatMap(
                (parentVariable) => {
                  const mergedFrom =
                    state.typebotsQueue[0].typebot.variables.find(
                      (v) => v.name === parentVariable.name
                    )
                  // Mirrors the `?? variable.value` above: with no value on the
                  // linked side the parent keeps its own, so its type stays too.
                  if (!mergedFrom || isNotDefined(mergedFrom.value)) return []
                  const mergedType = capturedTypes[mergedFrom.id]
                  return mergedType ? [[parentVariable.id, mergedType]] : []
                }
              )
            )
          : {}
        // Then drop entries for variables the session no longer holds — the
        // popped typebot's own ids, except the ones the merge carried over as
        // they were. Leaving them would rot: `fillVariablesWithExistingValues`
        // refills a linked typebot's variables by name on a second visit without
        // recording a type, so a leftover entry would be inherited by the parent
        // on the next pop and describe a value the link never wrote. Pruning
        // against the whole queue, not just the head, keeps a grandparent's
        // types alive through nested links.
        const idsStillInSession = new Set(
          newSessionState.typebotsQueue.flatMap((typebotInQueue) =>
            typebotInQueue.typebot.variables.map((variable) => variable.id)
          )
        )
        newSessionState.previewMetadata = {
          ...newSessionState.previewMetadata,
          variableTypes: Object.fromEntries(
            Object.entries({ ...capturedTypes, ...inheritedTypes }).filter(
              ([variableId]) => idsStillInSession.has(variableId)
            )
          ),
        }
      }
      const nextGroup = await getNextGroup({
        state: newSessionState,
        edgeId: nextEdgeId,
        isOffDefaultPath,
      })
      newSessionState = nextGroup.newSessionState
      if (!nextGroup)
        return {
          newSessionState,
        }
      return {
        ...nextGroup,
        newSessionState,
      }
    }
    return {
      newSessionState: state,
    }
  }
  const nextGroup = state.typebotsQueue[0].typebot.groups.find(
    byId(nextEdge.to.groupId)
  )
  if (!nextGroup)
    return {
      newSessionState: state,
    }
  const startBlockIndex = nextEdge.to.blockId
    ? nextGroup.blocks.findIndex(byId(nextEdge.to.blockId))
    : 0
  const currentVisitedEdgeIndex = isOffDefaultPath
    ? (state.currentVisitedEdgeIndex ?? -1) + 1
    : state.currentVisitedEdgeIndex
  const resultId = state.typebotsQueue[0].resultId
  return {
    group: {
      ...nextGroup,
      blocks: nextGroup.blocks.slice(startBlockIndex),
    } as Group,
    newSessionState: {
      ...state,
      currentVisitedEdgeIndex,
      // In preview (no resultId) we record the full execution trail
      // (`trailEdgeIds`: every non-virtual edge traversed, default or not) for
      // the builder's trail highlight, while keeping `visitedEdges` limited to
      // off-default branch decisions (used by transcript rebuilding).
      previewMetadata: resultId
        ? state.previewMetadata
        : {
            ...state.previewMetadata,
            visitedEdges: isOffDefaultPath
              ? (state.previewMetadata?.visitedEdges ?? []).concat(nextEdge.id)
              : state.previewMetadata?.visitedEdges,
            trailEdgeIds: nextEdge.id.startsWith('virtual-')
              ? state.previewMetadata?.trailEdgeIds
              : (state.previewMetadata?.trailEdgeIds ?? []).concat(nextEdge.id),
          },
    },
    visitedEdge:
      resultId && isOffDefaultPath && !nextEdge.id.startsWith('virtual-')
        ? {
            index: currentVisitedEdgeIndex as number,
            edgeId: nextEdge.id,
            resultId,
          }
        : undefined,
  }
}
