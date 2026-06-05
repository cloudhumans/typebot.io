import { describe, it, expect } from 'vitest'
import { executeDeclareVariables } from './executeDeclareVariables'
import { DeclareVariablesBlock, SessionState } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'

const makeState = (
  variables: Array<{ id: string; name: string; value?: unknown }>,
  isToolWorkflow = false
): SessionState =>
  ({
    typebotsQueue: [
      {
        typebot: {
          variables,
          isToolWorkflow,
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
      const state = makeState([{ id: 'v1', name: 'optionalParam' }], true)
      const block = makeBlock([
        { variableId: 'v1', description: 'an optional param', required: false },
      ])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeUndefined()
      expect(result.outgoingEdgeId).toBe('edge-1')
    })

    it('throws for a required variable without a value (no silent skip)', async () => {
      // The MCP route does not validate `required`, so a required variable can
      // arrive empty. Skipping it would silently produce an incomplete payload
      // ({{var}} === ""), so we fail loudly instead — surfaced as a JSON-RPC
      // error by the /api/mcp tools/call handler. This is NOT a pause.
      const state = makeState([{ id: 'v1', name: 'requiredParam' }], true)
      const block = makeBlock([
        { variableId: 'v1', description: 'a required param', required: true },
      ])

      await expect(executeDeclareVariables(state, block)).rejects.toThrow(
        /Missing required variable "requiredParam"/
      )
    })
  })

  describe('interactive (non-TOOL) mode — behavior preserved (blast radius zero)', () => {
    it('still pauses for an empty variable (isToolWorkflow false)', async () => {
      const state = makeState([{ id: 'v1', name: 'someParam' }], false)
      const block = makeBlock([
        { variableId: 'v1', description: 'a param', required: false },
      ])

      const result = await executeDeclareVariables(state, block)

      expect(result.input).toBeDefined()
      expect(result.input?.options?.variableId).toBe('v1')
    })

    it('still pauses for an empty variable when isToolWorkflow is absent (legacy session)', async () => {
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
      true
    )
    const block = makeBlock([
      { variableId: 'v1', description: 'already filled', required: true },
    ])

    const result = await executeDeclareVariables(state, block)

    expect(result.input).toBeUndefined()
    expect(result.outgoingEdgeId).toBe('edge-1')
  })
})
