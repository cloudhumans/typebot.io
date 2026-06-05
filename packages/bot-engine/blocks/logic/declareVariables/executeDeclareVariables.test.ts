import { describe, it, expect } from 'vitest'
import { executeDeclareVariables } from './executeDeclareVariables'
import { DeclareVariablesBlock, SessionState } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'

const makeState = (
  variables: Array<{ id: string; name: string; value?: unknown }>
): SessionState =>
  ({
    typebotsQueue: [
      {
        typebot: {
          variables,
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
  it('does not pause the flow for an optional (required: false) variable without a value', async () => {
    const state = makeState([{ id: 'v1', name: 'optionalParam' }])
    const block = makeBlock([
      { variableId: 'v1', description: 'an optional param', required: false },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeUndefined()
    expect(result.outgoingEdgeId).toBe('edge-1')
  })

  it('still pauses the flow for a required variable without a value', async () => {
    const state = makeState([{ id: 'v1', name: 'requiredParam' }])
    const block = makeBlock([
      { variableId: 'v1', description: 'a required param', required: true },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeDefined()
    expect(result.input?.options?.variableId).toBe('v1')
  })

  it('pauses the flow when the required flag is absent (legacy default = required)', async () => {
    const state = makeState([{ id: 'v1', name: 'legacyParam' }])
    const block = makeBlock([
      { variableId: 'v1', description: 'a legacy param' },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeDefined()
  })

  it('skips a leading optional empty var and pauses on the required one (Bugbot misroute scenario)', async () => {
    // [optional(empty), required(empty)] — the paused input must target the
    // REQUIRED variable, not the optional one. This is the same selection that
    // continueBotFlow relies on to save the reply to the correct variable; if
    // they disagreed, the reply would be saved to the optional var and the
    // required prompt would re-appear (misroute + duplicate prompt).
    const state = makeState([
      { id: 'v1', name: 'optionalParam' },
      { id: 'v2', name: 'requiredParam' },
    ])
    const block = makeBlock([
      { variableId: 'v1', description: 'an optional param', required: false },
      { variableId: 'v2', description: 'a required param', required: true },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeDefined()
    expect(result.input?.options?.variableId).toBe('v2')
  })

  it('proceeds without input when the variable already has a value', async () => {
    const state = makeState([{ id: 'v1', name: 'filled', value: 'hello' }])
    const block = makeBlock([
      { variableId: 'v1', description: 'already filled', required: true },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeUndefined()
    expect(result.outgoingEdgeId).toBe('edge-1')
  })
})
