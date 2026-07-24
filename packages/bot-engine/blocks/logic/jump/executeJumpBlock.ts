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

  // Preview: o jump transita por uma edge virtual (sem linha no editor).
  // Registra o grupo alvo para o builder sinalizar o loop-back.
  if (!newSessionState.typebotsQueue[0].resultId)
    newSessionState = {
      ...newSessionState,
      previewMetadata: {
        ...newSessionState.previewMetadata,
        jumpTargetGroupIds: (
          newSessionState.previewMetadata?.jumpTargetGroupIds ?? []
        ).concat(groupId),
      },
    }

  return { outgoingEdgeId: portalEdge.id, newSessionState }
}
