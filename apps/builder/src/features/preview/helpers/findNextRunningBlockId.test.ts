import { TypebotV6 } from '@typebot.io/schemas'
import { InputBlockType } from '@typebot.io/schemas/features/blocks/inputs/constants'
import { IntegrationBlockType } from '@typebot.io/schemas/features/blocks/integrations/constants'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { describe, expect, it } from 'vitest'
import { findNextRunningBlockId } from './findNextRunningBlockId'

const block = (id: string, type: string) => ({ id, type, options: {} })

const group = (id: string, blocks: ReturnType<typeof block>[]) => ({
  id,
  title: id,
  graphCoordinates: { x: 0, y: 0 },
  blocks,
})

const edge = (id: string, fromBlockId: string, toGroupId: string) => ({
  id,
  from: { blockId: fromBlockId },
  to: { groupId: toGroupId },
})

const typebotWith = ({
  groups,
  edges,
}: {
  groups: ReturnType<typeof group>[]
  edges: ReturnType<typeof edge>[]
}) => ({ id: 'typebot_1', version: '6', groups, edges } as unknown as TypebotV6)

const answeredInput = block('block_answered', InputBlockType.TEXT)

describe('findNextRunningBlockId', () => {
  it('returns the id of an HTTP request reached through a linear path', () => {
    const webhook = block('block_webhook', IntegrationBlockType.WEBHOOK)
    const typebot = typebotWith({
      groups: [
        group('group_1', [answeredInput]),
        group('group_2', [block('block_text', 'text'), webhook]),
      ],
      edges: [edge('edge_1', answeredInput.id, 'group_2')],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBe(webhook.id)
  })

  it('stops at the next input, since what runs after belongs to another round-trip', () => {
    const typebot = typebotWith({
      groups: [
        group('group_1', [answeredInput]),
        group('group_2', [
          block('block_next_input', InputBlockType.TEXT),
          block('block_webhook', IntegrationBlockType.WEBHOOK),
        ]),
      ],
      edges: [edge('edge_1', answeredInput.id, 'group_2')],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBeUndefined()
  })

  it.each([
    ['Condition', LogicBlockType.CONDITION],
    ['Jump', LogicBlockType.JUMP],
    ['AB test', LogicBlockType.AB_TEST],
  ])('stops at a %s, whose branch is decided server-side', (_label, type) => {
    const typebot = typebotWith({
      groups: [
        group('group_1', [answeredInput]),
        group('group_2', [
          block('block_branching', type),
          block('block_webhook', IntegrationBlockType.WEBHOOK),
        ]),
      ],
      edges: [edge('edge_1', answeredInput.id, 'group_2')],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBeUndefined()
  })

  it('returns undefined when the answered block has several outgoing edges', () => {
    const typebot = typebotWith({
      groups: [
        group('group_1', [answeredInput]),
        group('group_2', [
          block('block_webhook', IntegrationBlockType.WEBHOOK),
        ]),
        group('group_3', [
          block('block_webhook_2', IntegrationBlockType.WEBHOOK),
        ]),
      ],
      edges: [
        edge('edge_1', answeredInput.id, 'group_2'),
        edge('edge_2', answeredInput.id, 'group_3'),
      ],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBeUndefined()
  })

  it('follows the single item edge actually taken (single-option Buttons)', () => {
    const buttons = block('block_buttons', InputBlockType.CHOICE)
    const webhook = block('block_webhook', IntegrationBlockType.WEBHOOK)
    const typebot = typebotWith({
      groups: [group('group_1', [buttons]), group('group_2', [webhook])],
      edges: [
        {
          id: 'edge_1',
          from: { blockId: buttons.id, itemId: 'item_1' },
          to: { groupId: 'group_2' },
        },
      ],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: buttons.id })
    ).toBe(webhook.id)
  })

  it('resolves the target group by group id, not by block id', () => {
    // Regression guard: an earlier version looked the group up by *block* id
    // while callers passed `edge.to.groupId`, so every edge resolved to nothing
    // and the spinner never showed.
    const webhook = block('block_webhook', IntegrationBlockType.WEBHOOK)
    const typebot = typebotWith({
      groups: [group('group_1', [answeredInput]), group('group_2', [webhook])],
      edges: [edge('edge_1', answeredInput.id, 'group_2')],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBe(webhook.id)
  })

  it('returns undefined when the flow loops back into a group already walked', () => {
    const typebot = typebotWith({
      groups: [group('group_1', [answeredInput, block('block_text', 'text')])],
      edges: [edge('edge_loop', 'block_text', 'group_1')],
    })

    expect(
      findNextRunningBlockId({ typebot, answeredBlockId: answeredInput.id })
    ).toBeUndefined()
  })
})
