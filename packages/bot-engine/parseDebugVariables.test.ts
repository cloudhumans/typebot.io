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

  describe('value shown next to the type', () => {
    it('parses a stringified object back, so the modal can format it', () => {
      // `JSON.parse` is the exact inverse of the `JSON.stringify` that stored it.
      const [variable] = parseDebugVariables(
        stateWith({
          variables: [{ id: 'v1', name: 'obj', value: '{"a":1}' }],
          variableTypes: { v1: 'object' },
        })
      )

      expect(variable?.value).toEqual({ a: 1 })
    })

    it('leaves a list as the text it is stored as', () => {
      // A Code block reading this list back also receives `['a', '4']`
      // (`parseGuessedValueType` does not touch arrays), so converting the '4'
      // here would show a value the flow never sees.
      const [variable] = parseDebugVariables(
        stateWith({
          variables: [{ id: 'v1', name: 'list', value: ['a', '4'] }],
          variableTypes: { v1: 'object' },
        })
      )

      expect(variable?.value).toEqual(['a', '4'])
    })

    it('keeps null items of a list', () => {
      const [variable] = parseDebugVariables(
        stateWith({
          variables: [{ id: 'v1', name: 'list', value: ['a', null] }],
          variableTypes: { v1: 'object' },
        })
      )

      expect(variable?.value).toEqual(['a', null])
    })

    it.each([
      ['5', 'number'],
      ['true', 'boolean'],
      ['null', 'null'],
      ['undefined', 'undefined'],
      ['{"a":1}', 'object'],
    ])(
      'shows the text %s as typed when the captured type says string',
      (stored) => {
        // These all parse as JSON, so converting them would replace the value
        // with something else — `null` and `undefined` would even blank the cell
        // while the type still read 'string'.
        const [variable] = parseDebugVariables(
          stateWith({
            variables: [{ id: 'v1', name: 'text', value: stored }],
            variableTypes: { v1: 'string' },
          })
        )

        expect(variable?.value).toBe(stored)
        expect(variable?.type).toBe('string')
      }
    )
  })

  describe('variables the run never wrote', () => {
    it('reports the type of the value as stored, without reinterpreting it', () => {
      // Prefilled, resumed session or a linked typebot: nothing captured a type,
      // and all that is known is that the session holds text. Reporting 'number'
      // for `looksNumeric` would be a guess.
      const variables = parseDebugVariables(
        stateWith({
          variables: [
            { id: 'v1', name: 'text', value: 'hello' },
            { id: 'v2', name: 'looksNumeric', value: '5' },
            { id: 'v3', name: 'looksLikeJson', value: '{"a":1}' },
            { id: 'v4', name: 'list', value: ['a', 'b'] },
          ],
        })
      )

      expect(variables.map((v) => [v.name, v.type, v.value])).toEqual([
        ['text', 'string', 'hello'],
        ['looksNumeric', 'string', '5'],
        ['looksLikeJson', 'string', '{"a":1}'],
        ['list', 'object', ['a', 'b']],
      ])
    })

    it.each(['007', '+5511999999999', 'NaN'])(
      'leaves %s alone, value and type',
      (stored) => {
        // Guards the phone/ID case: these must never be shown as numbers.
        const [variable] = parseDebugVariables(
          stateWith({ variables: [{ id: 'v1', name: 'phone', value: stored }] })
        )

        expect(variable?.value).toBe(stored)
        expect(variable?.type).toBe('string')
      }
    )
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
