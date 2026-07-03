import { describe, it, expect } from 'vitest'
import { sanitizeNullBytes } from './sanitizeNullBytes'

// Prisma's JsonNull/DbNull sentinels are class instances with a non-Object
// prototype (verified against @prisma/client 5.12.1). Stubs keep this suite
// free of the generated client, which CI's unit-test job never generates.
class SentinelStub {}
const jsonNullStub = new SentinelStub()
const dbNullStub = new SentinelStub()

describe('sanitizeNullBytes', () => {
  it('strips a single null byte from a string', () => {
    expect(sanitizeNullBytes('foo\u0000bar')).toBe('foobar')
  })

  it('strips multiple/consecutive null bytes', () => {
    expect(sanitizeNullBytes('foo\u0000\u0000\u0000bar')).toBe('foobar')
    expect(sanitizeNullBytes('\u0000\u0000\u0000')).toBe('')
  })

  it('strips null bytes deep inside nested objects', () => {
    expect(sanitizeNullBytes({ a: { b: { c: 'foo\u0000bar' } } })).toEqual({
      a: { b: { c: 'foobar' } },
    })
  })

  it('strips null bytes inside arrays, including array-in-object-in-array nesting', () => {
    expect(sanitizeNullBytes(['foo\u0000bar', 'clean'])).toEqual([
      'foobar',
      'clean',
    ])
    expect(
      sanitizeNullBytes([{ items: ['a\u0000b', { nested: 'c\u0000d' }] }])
    ).toEqual([{ items: ['ab', { nested: 'cd' }] }])
  })

  it('returns the same reference for clean strings, objects, and arrays', () => {
    const cleanString = 'clean'
    expect(sanitizeNullBytes(cleanString)).toBe(cleanString)

    const cleanObject = { a: { b: 'clean' } }
    expect(sanitizeNullBytes(cleanObject)).toBe(cleanObject)

    const cleanArray = [{ a: 'clean' }, 'also clean']
    expect(sanitizeNullBytes(cleanArray)).toBe(cleanArray)
  })

  it('does not mutate the input object and returns a new reference', () => {
    const dirty = { a: { b: 'foo\u0000bar' } }
    const result = sanitizeNullBytes(dirty)

    expect(result).not.toBe(dirty)
    expect(dirty.a.b).toBe('foo\u0000bar')
    expect(result).toEqual({ a: { b: 'foobar' } })
  })

  it('passes Date instances through by identity', () => {
    const date = new Date()
    expect(sanitizeNullBytes(date)).toBe(date)
    expect(sanitizeNullBytes({ date })).toEqual({ date })
    expect(sanitizeNullBytes({ date }).date).toBe(date)
  })

  it('passes Buffer and Uint8Array through by identity', () => {
    const buffer = Buffer.from('foo\u0000bar')
    expect(sanitizeNullBytes(buffer)).toBe(buffer)

    const uint8Array = new Uint8Array([0, 1, 2])
    expect(sanitizeNullBytes(uint8Array)).toBe(uint8Array)
  })

  it('passes class-instance sentinels (Prisma JsonNull/DbNull shape) through by identity', () => {
    expect(sanitizeNullBytes(jsonNullStub)).toBe(jsonNullStub)
    expect(sanitizeNullBytes(dbNullStub)).toBe(dbNullStub)
  })

  it('passes primitives through unchanged', () => {
    expect(sanitizeNullBytes(42)).toBe(42)
    expect(sanitizeNullBytes(true)).toBe(true)
    expect(sanitizeNullBytes(null)).toBe(null)
    expect(sanitizeNullBytes(undefined)).toBe(undefined)
    expect(sanitizeNullBytes(BigInt(42))).toBe(BigInt(42))
  })

  it('deep-cleans a realistic tool-call payload while preserving structure and untouched references', () => {
    const untouchedSibling = { untouched: true }
    const payload = {
      data: {
        state: {
          typebotsQueue: [
            {
              typebot: {
                variables: [{ id: 'v1', value: 'ped\u0000ido' }],
              },
            },
          ],
        },
        sibling: untouchedSibling,
      },
    }

    const result = sanitizeNullBytes(payload)

    expect(result).toEqual({
      data: {
        state: {
          typebotsQueue: [
            {
              typebot: {
                variables: [{ id: 'v1', value: 'pedido' }],
              },
            },
          ],
        },
        sibling: { untouched: true },
      },
    })
    expect(result.data.sibling).toBe(untouchedSibling)
  })

  it('strips null bytes from object keys', () => {
    const input = { ['a\u0000b']: 'value' }
    const result = sanitizeNullBytes(input)

    expect(result).not.toBe(input)
    expect(Object.keys(result)).toEqual(['ab'])
    expect(result['ab']).toBe('value')
  })
})
