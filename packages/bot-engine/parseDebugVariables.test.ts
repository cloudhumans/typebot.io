import { SessionState } from '@typebot.io/schemas'
import { describe, expect, it } from 'vitest'
import { parseDebugVariables } from './parseDebugVariables'

// Values are always text in the session — `updateVariablesInSession` runs every
// write through `safeStringify`. These fixtures use the stored (stringified)
// shape on purpose: it is what the snapshot actually reads.
const stateWith = (
  variables: { id: string; name: string; value?: unknown }[]
) =>
  ({
    version: '3',
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

// Plain `typeof`, which is what the debug panel reports (arrays included: they
// are 'object' in JS).
const typeOf = (value: unknown) => typeof value

describe('parseDebugVariables', () => {
  it('restores the type the flow produced, not the stringified storage type', () => {
    // The five cases a Code block writing
    //   setVariable("typeNumber", 5) / true / ["a", 4] / {"a": 1}
    // leaves in the session. Reading `typeof` off the stored value would answer
    // String for everything but the list.
    const variables = parseDebugVariables(
      stateWith([
        { id: 'v1', name: 'typeString', value: 'text' },
        { id: 'v2', name: 'typeNumber', value: '5' },
        { id: 'v3', name: 'typeBoolean', value: 'true' },
        { id: 'v4', name: 'typeList', value: ['a', '4'] },
        { id: 'v5', name: 'typeObject', value: '{"a":1}' },
      ])
    )

    expect(variables.map((v) => [v.name, typeOf(v.value)])).toEqual([
      ['typeString', 'string'],
      ['typeNumber', 'number'],
      ['typeBoolean', 'boolean'],
      ['typeList', 'object'],
      ['typeObject', 'object'],
    ])
    expect(variables[1]?.value).toBe(5)
    expect(variables[2]?.value).toBe(true)
    expect(Array.isArray(variables[3]?.value)).toBe(true)
    expect(variables[4]?.value).toEqual({ a: 1 })
  })

  it('restores list items one by one', () => {
    // `["a", 4]` is stored as `['a', '4']`, so the number has to come back per
    // item — the same way `deepParseVariables` recurses into arrays.
    const [variable] = parseDebugVariables(
      stateWith([{ id: 'v1', name: 'list', value: ['a', '4'] }])
    )

    expect(variable?.value).toEqual(['a', 4])
  })

  it('keeps null items of a list', () => {
    const [variable] = parseDebugVariables(
      stateWith([{ id: 'v1', name: 'list', value: ['a', null] }])
    )

    expect(variable?.value).toEqual(['a', null])
  })

  it.each([
    ['007', 'a leading zero is not valid JSON'],
    ['+5511999999999', 'a leading plus is not valid JSON'],
    ['NaN', 'NaN is not valid JSON'],
  ])('keeps %s as a string, since %s', (stored) => {
    // Guards the phone/ID case: these must not be turned into numbers.
    const [variable] = parseDebugVariables(
      stateWith([{ id: 'v1', name: 'phone', value: stored }])
    )

    expect(variable?.value).toBe(stored)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])(
    'resolves the literal text %s the same way the engine does',
    (stored, expected) => {
      // Deliberate, not a happy accident: `parseGuessedTypeFromString` is the
      // engine's rule, and a variable whose text is exactly `null`/`undefined`
      // resolves to that value everywhere else too.
      const [variable] = parseDebugVariables(
        stateWith([{ id: 'v1', name: 'edge', value: stored }])
      )

      expect(variable?.value).toBe(expected)
    }
  )

  it('leaves out variables that hold no value', () => {
    // The panel's contract: it only ever lists filled variables.
    const variables = parseDebugVariables(
      stateWith([
        { id: 'v1', name: 'filled', value: 'x' },
        { id: 'v2', name: 'undeclared' },
        { id: 'v3', name: 'nulled', value: null },
      ])
    )

    expect(variables.map((v) => v.name)).toEqual(['filled'])
  })

  it('keeps an empty string, which is a filled value', () => {
    const variables = parseDebugVariables(
      stateWith([{ id: 'v1', name: 'empty', value: '' }])
    )

    expect(variables).toEqual([{ id: 'v1', name: 'empty', value: '' }])
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
