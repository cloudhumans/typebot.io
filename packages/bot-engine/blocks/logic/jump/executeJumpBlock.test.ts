import { SessionState } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { JumpBlock } from '@typebot.io/schemas/features/blocks/logic/jump'
import { describe, expect, it } from 'vitest'
import { executeJumpBlock } from './executeJumpBlock'

const jumpBlock = {
  id: 'block_jump',
  type: LogicBlockType.JUMP,
  options: { groupId: 'group_target' },
} as unknown as JumpBlock

const targetGroup = {
  id: 'group_target',
  title: 'Target',
  graphCoordinates: { x: 0, y: 0 },
  blocks: [{ id: 'block_in_target', type: 'text', content: {} }],
}

const stateWith = ({
  resultId,
  previewMetadata,
}: {
  resultId?: string
  previewMetadata?: Record<string, unknown>
} = {}) =>
  ({
    version: '3',
    previewMetadata,
    typebotsQueue: [
      {
        resultId,
        answers: [],
        typebot: {
          id: 'typebot_1',
          version: '6',
          groups: [targetGroup],
          edges: [],
          variables: [],
        },
      },
    ],
  } as unknown as SessionState)

describe('executeJumpBlock preview trail recording', () => {
  it('records the origin block and the target group', async () => {
    const { newSessionState } = executeJumpBlock(stateWith(), jumpBlock)

    expect(newSessionState?.previewMetadata?.jumps).toEqual([
      { fromBlockId: 'block_jump', toGroupId: 'group_target' },
    ])
  })

  it('dedupes on write, so a loop through the same jump stores it once', async () => {
    // A jump inside a loop can run dozens of times, and this array travels in
    // the session state *and* in every `continueChat` response.
    const { newSessionState } = executeJumpBlock(
      stateWith({
        previewMetadata: {
          jumps: [{ fromBlockId: 'block_jump', toGroupId: 'group_target' }],
        },
      }),
      jumpBlock
    )

    expect(newSessionState?.previewMetadata?.jumps).toEqual([
      { fromBlockId: 'block_jump', toGroupId: 'group_target' },
    ])
  })

  it('keeps a second jump into the same group, since the origin differs', async () => {
    const { newSessionState } = executeJumpBlock(
      stateWith({
        previewMetadata: {
          jumps: [
            { fromBlockId: 'block_other_jump', toGroupId: 'group_target' },
          ],
        },
      }),
      jumpBlock
    )

    expect(newSessionState?.previewMetadata?.jumps).toEqual([
      { fromBlockId: 'block_other_jump', toGroupId: 'group_target' },
      { fromBlockId: 'block_jump', toGroupId: 'group_target' },
    ])
  })

  it('records nothing when the run has a resultId', async () => {
    // Published runs must not carry preview-only metadata in their session.
    const { newSessionState } = executeJumpBlock(
      stateWith({ resultId: 'result_1' }),
      jumpBlock
    )

    expect(newSessionState?.previewMetadata?.jumps).toBeUndefined()
  })

  it('still returns the portal edge it jumps through', async () => {
    const { outgoingEdgeId, newSessionState } = executeJumpBlock(
      stateWith(),
      jumpBlock
    )

    expect(outgoingEdgeId).toBeDefined()
    expect(
      newSessionState?.typebotsQueue[0].typebot.edges.map((edge) => edge.id)
    ).toContain(outgoingEdgeId)
  })
})
