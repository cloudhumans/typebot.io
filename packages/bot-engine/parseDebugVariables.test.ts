import { SessionState } from '@typebot.io/schemas'
import { describe, expect, it } from 'vitest'
import { parseDebugVariables } from './parseDebugVariables'

// Values are always text in the session — `updateVariablesInSession` runs every
// write through `safeStringify`. These fixtures use the stored (stringified)
// shape on purpose: it is what the snapshot actually reads. `variableTypes` is
// what that same function records before stringifying.
const stateWith = ({
  variables,
  variableTypes,
}: {
  variables: { id: string; name: string; value?: unknown }[]
  variableTypes?: Record<string, string>
}) =>
  ({
    version: '3',
    previewMetadata: variableTypes ? { variableTypes } : undefined,
    typebotsQueue: [
      {
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

describe('parseDebugVariables', () => {
  it('reports the type captured at write time, not the storage type', () => {
    // What a Code block doing
    //   setVariable("typeNumber", 5) / true / ["a", 4] / {"a": 1}
    // leaves behind. Reading `typeof` off the stored value would answer 'string'
    // for all but the list.
    const variables = parseDebugVariables(
      stateWith({
        variables: [
          { id: 'v1', name: 'typeString', value: 'text' },
          { id: 'v2', name: 'typeNumber', value: '5' },
          { id: 'v3', name: 'typeBoolean', value: 'true' },
          { id: 'v4', name: 'typeList', value: ['a', '4'] },
          { id: 'v5', name: 'typeObject', value: '{"a":1}' },
        ],
        variableTypes: {
          v1: 'string',
          v2: 'number',
          v3: 'boolean',
          v4: 'object',
          v5: 'object',
        },
      })
    )

    expect(variables.map((v) => [v.name, v.type])).toEqual([
      ['typeString', 'string'],
      ['typeNumber', 'number'],
      ['typeBoolean', 'boolean'],
      ['typeList', 'object'],
      ['typeObject', 'object'],
    ])
  })

  it('tells a text input holding "5" from the number 5', () => {
    // The whole reason the type is captured instead of guessed: both are stored
    // as the exact same text.
    const [typed, text] = parseDebugVariables(
      stateWith({
        variables: [
          { id: 'v1', name: 'fromCode', value: '5' },
          { id: 'v2', name: 'fromInput', value: '5' },
        ],
        variableTypes: { v1: 'number', v2: 'string' },
      })
    )

    expect(typed?.type).toBe('number')
    expect(text?.type).toBe('string')
  })

  it('follows the latest write when a variable changes type', () => {
    // `updateVariablesInSession` overwrites the entry on every write, so the map
    // describes what the variable holds now — a string that became a number
    // reports 'number'.
    const [variable] = parseDebugVariables(
      stateWith({
        variables: [{ id: 'v1', name: 'changed', value: '5' }],
        variableTypes: { v1: 'number' },
      })
    )

    expect(variable?.type).toBe('number')
  })

  it('falls back to the received value type when the run never wrote it', () => {
    // Prefilled variables, a resumed session or a linked typebot's own
    // variables: nothing captured a type for them.
    const variables = parseDebugVariables(
      stateWith({
        variables: [
          { id: 'v1', name: 'text', value: 'hello' },
          { id: 'v2', name: 'looksNumeric', value: '5' },
        ],
      })
    )

    expect(variables.map((v) => v.type)).toEqual(['string', 'number'])
  })

  it('restores the value for display, list items included', () => {
    // Display only — `["a", 4]` is stored as `['a', '4']`, and the panel should
    // not show the number as text.
    const [variable] = parseDebugVariables(
      stateWith({
        variables: [{ id: 'v1', name: 'list', value: ['a', '4'] }],
        variableTypes: { v1: 'object' },
      })
    )

    expect(variable?.value).toEqual(['a', 4])
  })

  it('keeps null items of a list', () => {
    const [variable] = parseDebugVariables(
      stateWith({
        variables: [{ id: 'v1', name: 'list', value: ['a', null] }],
      })
    )

    expect(variable?.value).toEqual(['a', null])
  })

  it.each([
    ['007', 'a leading zero is not valid JSON'],
    ['+5511999999999', 'a leading plus is not valid JSON'],
    ['NaN', 'NaN is not valid JSON'],
  ])('leaves %s alone, since %s', (stored) => {
    // Guards the phone/ID case: these must not be shown as numbers.
    const [variable] = parseDebugVariables(
      stateWith({ variables: [{ id: 'v1', name: 'phone', value: stored }] })
    )

    expect(variable?.value).toBe(stored)
    expect(variable?.type).toBe('string')
  })

  it('leaves out variables that hold no value', () => {
    // The panel's contract: it only ever lists filled variables.
    const variables = parseDebugVariables(
      stateWith({
        variables: [
          { id: 'v1', name: 'filled', value: 'x' },
          { id: 'v2', name: 'undeclared' },
          { id: 'v3', name: 'nulled', value: null },
        ],
      })
    )

    expect(variables.map((v) => v.name)).toEqual(['filled'])
  })

  it('keeps an empty string, which is a filled value', () => {
    const variables = parseDebugVariables(
      stateWith({ variables: [{ id: 'v1', name: 'empty', value: '' }] })
    )

    expect(variables).toEqual([
      { id: 'v1', name: 'empty', value: '', type: 'string' },
    ])
  })

  it('returns nothing when the queue is empty', () => {
    expect(
      parseDebugVariables({
        version: '3',
        typebotsQueue: [],
      } as unknown as SessionState)
    ).toEqual([])
  })
})
