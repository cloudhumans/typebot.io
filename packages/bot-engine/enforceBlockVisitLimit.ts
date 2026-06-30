import { env } from '@typebot.io/env'
import logger from '@typebot.io/lib/logger'
import { Block, Group, SessionState } from '@typebot.io/schemas'
import { workspaceLogLabel } from './workspaceLogLabel'

// Block type identifiers for LLM-call integrations.
// Legacy schema enum value (`OpenAI`) plus forge block ids (lowercase, kebab).
const LLM_BLOCK_TYPES = new Set<string>([
  'OpenAI',
  'Zemantic AI',
  'openai',
  'anthropic',
  'mistral',
  'open-router',
  'together-ai',
  'zemantic-ai',
  'dify-ai',
])

export const isLlmBlock = (blockType: string): boolean =>
  LLM_BLOCK_TYPES.has(blockType)

type Outcome =
  | { kind: 'continue'; state: SessionState }
  | { kind: 'terminate'; state: SessionState }

type Params = {
  state: SessionState
  block: Block
  group: Group
  sessionId?: string
  willSkipBubble: boolean
}

/**
 * Increments the per-block visit counter on the session state and emits
 * structured warn/error logs when configured thresholds are crossed.
 *
 * Returns:
 * - `{kind:'continue'}` — caller proceeds with the block; updated state included.
 * - `{kind:'terminate'}` — caller must short-circuit the run, returning the
 *   updated state with `currentBlockId` cleared so the engine treats the
 *   session as ended.
 *
 * Disabled (no state change, no logs) when `BLOCK_VISIT_LIMIT_ENABLED` is
 * false or the bubble would be skipped this turn anyway.
 */
export const enforceBlockVisitLimit = ({
  state,
  block,
  group,
  sessionId,
  willSkipBubble,
}: Params): Outcome => {
  if (!env.BLOCK_VISIT_LIMIT_ENABLED || willSkipBubble)
    return { kind: 'continue', state }

  const visitCount = (state.visitedBlockCounts?.[block.id] ?? 0) + 1
  const newState: SessionState = {
    ...state,
    visitedBlockCounts: {
      ...(state.visitedBlockCounts ?? {}),
      [block.id]: visitCount,
    },
  }

  const isLlm = isLlmBlock(block.type)
  const limit = isLlm
    ? env.MAX_LLM_BLOCK_VISITS_PER_SESSION
    : env.MAX_BLOCK_VISITS_PER_SESSION
  const warnThreshold = isLlm
    ? env.LLM_BLOCK_VISIT_WARN_THRESHOLD
    : env.BLOCK_VISIT_WARN_THRESHOLD

  // Fast path for the common case: nothing to log this visit.
  if (visitCount !== warnThreshold && visitCount <= limit)
    return { kind: 'continue', state: newState }

  const typebot = newState.typebotsQueue[0].typebot
  const workspaceName = typebot.workspaceName ?? 'unknown'
  const workspaceLabel = workspaceLogLabel({
    id: typebot.workspaceId,
    name: typebot.workspaceName,
  })
  const baseLogPayload = {
    workspace: {
      id: typebot.workspaceId ?? 'unknown',
      name: workspaceName,
    },
    workflow: {
      id: typebot.id,
      name: typebot.name ?? 'unknown',
      schema_version: String(typebot.version ?? 'unknown'),
      execution_id: sessionId ?? 'preview',
      version_id: typebot.typebotHistoryId ?? 'unknown',
    },
    typebot_block: {
      id: block.id,
      type: block.type,
    },
    typebot_group: {
      id: group.id,
      name: group.title,
    },
    is_llm: isLlm,
  }

  if (visitCount === warnThreshold) {
    logger.warn(`${workspaceLabel} - Block visit warning threshold reached`, {
      ...baseLogPayload,
      visit_count: visitCount,
      threshold: warnThreshold,
    })
  }

  if (visitCount > limit) {
    logger.error(`${workspaceLabel} - Block visit limit exceeded`, {
      ...baseLogPayload,
      visit_count: visitCount,
      limit,
    })
    return {
      kind: 'terminate',
      state: { ...newState, currentBlockId: undefined },
    }
  }

  return { kind: 'continue', state: newState }
}
