import { describe, it, expect } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import { isPrismaUniqueViolation } from './isPrismaUniqueViolation'

describe('isPrismaUniqueViolation', () => {
  it('returns true for PrismaClientKnownRequestError with code P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    expect(isPrismaUniqueViolation(err)).toBe(true)
  })

  it('returns false for PrismaClientKnownRequestError with non-P2002 codes', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.12.1',
    })
    expect(isPrismaUniqueViolation(err)).toBe(false)
  })

  it('returns false for a plain Error instance', () => {
    expect(isPrismaUniqueViolation(new Error('boom'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isPrismaUniqueViolation(null)).toBe(false)
    expect(isPrismaUniqueViolation(undefined)).toBe(false)
    expect(isPrismaUniqueViolation('string')).toBe(false)
    expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(false)
    expect(isPrismaUniqueViolation(42)).toBe(false)
  })
})
