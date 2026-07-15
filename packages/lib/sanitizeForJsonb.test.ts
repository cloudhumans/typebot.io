import { describe, it, expect } from 'vitest'
import { sanitizeForJsonb } from './sanitizeForJsonb'

// Prisma's JsonNull/DbNull sentinels are class instances with a non-Object
// prototype (verified against @prisma/client 5.12.1). Stubs keep this suite
// free of the generated client, which CI's unit-test job never generates.
class SentinelStub {}
const jsonNullStub = new SentinelStub()
const dbNullStub = new SentinelStub()

describe('sanitizeForJsonb', () => {
  it('strips a single null byte from a string', () => {
    expect(sanitizeForJsonb('foo\u0000bar')).toBe('foobar')
  })

  it('strips multiple/consecutive null bytes', () => {
    expect(sanitizeForJsonb('foo\u0000\u0000\u0000bar')).toBe('foobar')
    expect(sanitizeForJsonb('\u0000\u0000\u0000')).toBe('')
  })

  it('strips null bytes deep inside nested objects', () => {
    expect(sanitizeForJsonb({ a: { b: { c: 'foo\u0000bar' } } })).toEqual({
      a: { b: { c: 'foobar' } },
    })
  })

  it('strips null bytes inside arrays, including array-in-object-in-array nesting', () => {
    expect(sanitizeForJsonb(['foo\u0000bar', 'clean'])).toEqual([
      'foobar',
      'clean',
    ])
    expect(
      sanitizeForJsonb([{ items: ['a\u0000b', { nested: 'c\u0000d' }] }])
    ).toEqual([{ items: ['ab', { nested: 'cd' }] }])
  })

  it('replaces a lone/unpaired surrogate with U+FFFD', () => {
    expect(sanitizeForJsonb('abc\uD83Dxyz')).toBe('abc�xyz')
    expect(sanitizeForJsonb('lone-low\uDE00end')).toBe('lone-low�end')
  })

  it('preserves a well-formed surrogate pair (real emoji)', () => {
    const emoji = 'hi 😀 there'
    expect(sanitizeForJsonb(emoji)).toBe(emoji)
  })

  it('replaces lone surrogates deep inside nested objects and arrays', () => {
    expect(sanitizeForJsonb({ a: { b: ['clean', 'trunc\uD83D'] } })).toEqual({
      a: { b: ['clean', 'trunc�'] },
    })
  })

  it('replaces a lone surrogate in an object key', () => {
    const input = { ['key\uD83D']: 'value' }
    const result = sanitizeForJsonb(input)

    expect(result).not.toBe(input)
    expect(Object.keys(result)).toEqual(['key�'])
    expect((result as Record<string, unknown>)['key�']).toBe('value')
  })

  it('handles a null byte and a lone surrogate in the same string', () => {
    expect(sanitizeForJsonb('a\u0000b\uD83Dc')).toBe('ab�c')
  })

  it('returns the same reference for clean strings, objects, and arrays', () => {
    const cleanString = 'clean'
    expect(sanitizeForJsonb(cleanString)).toBe(cleanString)

    const cleanObject = { a: { b: 'clean' } }
    expect(sanitizeForJsonb(cleanObject)).toBe(cleanObject)

    const cleanArray = [{ a: 'clean' }, 'also clean']
    expect(sanitizeForJsonb(cleanArray)).toBe(cleanArray)
  })

  it('does not mutate the input object and returns a new reference', () => {
    const dirty = { a: { b: 'foo\u0000bar' } }
    const result = sanitizeForJsonb(dirty)

    expect(result).not.toBe(dirty)
    expect(dirty.a.b).toBe('foo\u0000bar')
    expect(result).toEqual({ a: { b: 'foobar' } })
  })

  it('passes Date instances through by identity', () => {
    const date = new Date()
    expect(sanitizeForJsonb(date)).toBe(date)
    expect(sanitizeForJsonb({ date })).toEqual({ date })
    expect(sanitizeForJsonb({ date }).date).toBe(date)
  })

  it('passes Buffer and Uint8Array through by identity', () => {
    const buffer = Buffer.from('foo\u0000bar')
    expect(sanitizeForJsonb(buffer)).toBe(buffer)

    const uint8Array = new Uint8Array([0, 1, 2])
    expect(sanitizeForJsonb(uint8Array)).toBe(uint8Array)
  })

  it('passes class-instance sentinels (Prisma JsonNull/DbNull shape) through by identity', () => {
    expect(sanitizeForJsonb(jsonNullStub)).toBe(jsonNullStub)
    expect(sanitizeForJsonb(dbNullStub)).toBe(dbNullStub)
  })

  it('passes primitives through unchanged', () => {
    expect(sanitizeForJsonb(42)).toBe(42)
    expect(sanitizeForJsonb(true)).toBe(true)
    expect(sanitizeForJsonb(null)).toBe(null)
    expect(sanitizeForJsonb(undefined)).toBe(undefined)
    expect(sanitizeForJsonb(BigInt(42))).toBe(BigInt(42))
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

    const result = sanitizeForJsonb(payload)

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

  it('stores a key that sanitizes to __proto__ as an own property', () => {
    const input = { ['__pr\u0000oto__']: { polluted: true } }
    const result = sanitizeForJsonb(input)

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true)
    expect((result as Record<string, unknown>)['__proto__']).toEqual({
      polluted: true,
    })
  })

  it('preserves a null prototype on sanitized copies', () => {
    const input = Object.create(null) as Record<string, unknown>
    input.dirty = 'foo\u0000bar'
    const result = sanitizeForJsonb(input)

    expect(result).not.toBe(input)
    expect(Object.getPrototypeOf(result)).toBe(null)
    expect(result.dirty).toBe('foobar')
  })

  it('strips null bytes from object keys', () => {
    const input = { ['a\u0000b']: 'value' }
    const result = sanitizeForJsonb(input)

    expect(result).not.toBe(input)
    expect(Object.keys(result)).toEqual(['ab'])
    expect((result as Record<string, unknown>)['ab']).toBe('value')
  })
})
