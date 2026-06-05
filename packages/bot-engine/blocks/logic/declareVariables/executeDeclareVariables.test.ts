import { describe, it, expect } from 'vitest'
import { executeDeclareVariables } from './executeDeclareVariables'
import { DeclareVariablesBlock, SessionState } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'

const makeState = (
  variables: Array<{ id: string; name: string; value?: unknown }>,
  type: 'default' | 'TOOL' = 'default'
): SessionState =>
  ({
    typebotsQueue: [
      {
        typebot: {
          variables,
          settings: { general: { type } },
        },
      },
    ],
  } as unknown as SessionState)

const makeBlock = (
  declaredVariables: Array<{
    variableId: string
    description: string
    required?: boolean
  }>
): DeclareVariablesBlock =>
  ({
    id: 'block-1',
    type: LogicBlockType.DECLARE_VARIABLES,
    outgoingEdgeId: 'edge-1',
    options: { variables: declaredVariables },
  } as unknown as DeclareVariablesBlock)

describe('executeDeclareVariables', () => {
  describe('TOOL mode (headless — never pauses)', () => {
    it('does not pause for an optional variable without a value', async () => {
      const state = makeState([{ id: 'v1', name: 'optionalParam' }], 'TOOL')
      const block = makeBlock([
        { variableId: 'v1', description: 'an optional param', required: false },
      ])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeUndefined()
      expect(result.outgoingEdgeId).toBe('edge-1')
    })

    it('does not pause for a required variable without a value either', async () => {
      // TOOL flows run headless: there is no human to answer an input block,
      // so even a required variable must not block the run.
      const state = makeState([{ id: 'v1', name: 'requiredParam' }], 'TOOL')
      const block = makeBlock([
        { variableId: 'v1', description: 'a required param', required: true },
      ])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeUndefined()
      expect(result.outgoingEdgeId).toBe('edge-1')
    })
  })

  describe('interactive (non-TOOL) mode — behavior preserved (blast radius zero)', () => {
    it('still pauses for an empty variable (default settings type)', async () => {
      const state = makeState([{ id: 'v1', name: 'someParam' }], 'default')
      const block = makeBlock([
        { variableId: 'v1', description: 'a param', required: false },
      ])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeDefined()
      expect(result.input?.options?.variableId).toBe('v1')
    })

    it('still pauses for an empty variable when settings are absent (legacy session)', async () => {
      const state = {
        typebotsQueue: [{ typebot: { variables: [{ id: 'v1', name: 'p' }] } }],
      } as unknown as SessionState
      const block = makeBlock([{ variableId: 'v1', description: 'a param' }])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeDefined()
    })
  })

  it('proceeds without input when the variable already has a value (any mode)', async () => {
    const state = makeState(
      [{ id: 'v1', name: 'filled', value: 'hello' }],
      'TOOL'
    )
    const block = makeBlock([
      { variableId: 'v1', description: 'already filled', required: true },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeUndefined()
    expect(result.outgoingEdgeId).toBe('edge-1')
  })
})
