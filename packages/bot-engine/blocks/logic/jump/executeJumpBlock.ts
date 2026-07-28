import { addEdgeToTypebot, createPortalEdge } from '../../../addEdgeToTypebot'
import { ExecuteLogicResponse } from '../../../types'
import { TRPCError } from '@trpc/server'
import { SessionState } from '@typebot.io/schemas'
import { JumpBlock } from '@typebot.io/schemas/features/blocks/logic/jump'

export const executeJumpBlock = (
  state: SessionState,
  { groupId, blockId }: JumpBlock['options'] = {}
): ExecuteLogicResponse => {
  if (!groupId) return { outgoingEdgeId: undefined }
  const { typebot } = state.typebotsQueue[0]
  const groupToJumpTo = typebot.groups.find((group) => group.id === groupId)
  const blockToJumpTo =
    groupToJumpTo?.blocks.find((block) => block.id === blockId) ??
    groupToJumpTo?.blocks[0]

  if (!blockToJumpTo) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Block to jump to is not found. groupId: ${
        groupId ?? 'undefined'
      }, blockId: ${blockId ?? 'undefined'}`,
    })
  }

  const portalEdge = createPortalEdge({
    to: { groupId, blockId: blockToJumpTo?.id },
  })
  let newSessionState = addEdgeToTypebot(state, portalEdge)

  // Preview: a jump travels through a virtual edge (no line in the editor).
  // Records the target group so the builder can flag the loop-back. Deduped on
  // write: the builder only needs the set of targets, and a loop going through
  // the same jump 50 times would otherwise store it 50 times — in the session
  // state *and* in every `continueChat` response.
  if (!newSessionState.typebotsQueue[0].resultId) {
    const jumpTargetGroupIds =
      newSessionState.previewMetadata?.jumpTargetGroupIds ?? []
    if (!jumpTargetGroupIds.includes(groupId))
      newSessionState = {
        ...newSessionState,
        previewMetadata: {
          ...newSessionState.previewMetadata,
          jumpTargetGroupIds: [...jumpTargetGroupIds, groupId],
        },
      }
  }

  return { outgoingEdgeId: portalEdge.id, newSessionState }
}
