import { describe, expect, it } from 'vitest'
import { SessionState } from '../schemas'
import { updateVariablesInSession } from './updateVariablesInSession'

const stateWith = ({
  resultId,
  previewMetadata,
  variables = [],
}: {
  resultId?: string
  previewMetadata?: Record<string, unknown>
  variables?: { id: string; name: string; value?: unknown }[]
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
          groups: [],
          edges: [],
          variables,
        },
      },
    ],
  } as unknown as SessionState)

describe('updateVariablesInSession value type capture', () => {
  it('records the JS type of every value it stringifies', () => {
    // This is the last place the type exists: the values below are all written to
    // the session as text.
    const { updatedState } = updateVariablesInSession({
      state: stateWith(),
      newVariables: [
        { id: 'v1', name: 'aString', value: 'text' },
        { id: 'v2', name: 'aNumber', value: 5 },
        { id: 'v3', name: 'aBoolean', value: true },
        { id: 'v4', name: 'aList', value: ['a', 4] },
        { id: 'v5', name: 'anObject', value: { a: 1 } },
      ],
      currentBlockId: undefined,
    })

    expect(updatedState.previewMetadata?.variableTypes).toEqual({
      v1: 'string',
      v2: 'number',
      v3: 'boolean',
      v4: 'object',
      v5: 'object',
    })
  })

  it('confirms the values themselves were stringified', () => {
    // Guards the premise of the whole feature — if this ever stops being true,
    // capturing the type separately is no longer needed.
    const { updatedState } = updateVariablesInSession({
      state: stateWith(),
      newVariables: [
        { id: 'v1', name: 'aNumber', value: 5 },
        { id: 'v2', name: 'anObject', value: { a: 1 } },
        { id: 'v3', name: 'aList', value: ['a', 4] },
      ],
      currentBlockId: undefined,
    })

    const stored = updatedState.typebotsQueue[0].typebot.variables
    expect(stored.find((v) => v.id === 'v1')?.value).toBe('5')
    expect(stored.find((v) => v.id === 'v2')?.value).toBe('{"a":1}')
    expect(stored.find((v) => v.id === 'v3')?.value).toEqual(['a', '4'])
  })

  it('overwrites the recorded type when a variable changes type', () => {
    const { updatedState } = updateVariablesInSession({
      state: stateWith({
        previewMetadata: { variableTypes: { v1: 'string', v2: 'string' } },
      }),
      newVariables: [{ id: 'v1', name: 'changed', value: 5 }],
      currentBlockId: undefined,
    })

    // v1 follows the new write; v2 is untouched by this write and stays.
    expect(updatedState.previewMetadata?.variableTypes).toEqual({
      v1: 'number',
      v2: 'string',
    })
  })

  it('records nothing when the run has a resultId', () => {
    // Published runs must not carry preview-only metadata in their session.
    const { updatedState } = updateVariablesInSession({
      state: stateWith({ resultId: 'result_1' }),
      newVariables: [{ id: 'v1', name: 'aNumber', value: 5 }],
      currentBlockId: undefined,
    })

    expect(updatedState.previewMetadata?.variableTypes).toBeUndefined()
  })

  it('keeps the existing setVariableHistory alongside the types', () => {
    // Both live in `previewMetadata`; adding one must not drop the other.
    const { updatedState } = updateVariablesInSession({
      state: stateWith({
        previewMetadata: {
          setVariableHistory: [{ blockId: 'b1', variableId: 'v0', value: 'x' }],
        },
      }),
      newVariables: [{ id: 'v1', name: 'aNumber', value: 5 }],
      currentBlockId: undefined,
    })

    expect(updatedState.previewMetadata?.setVariableHistory).toHaveLength(1)
    expect(updatedState.previewMetadata?.variableTypes).toEqual({
      v1: 'number',
    })
  })
})
