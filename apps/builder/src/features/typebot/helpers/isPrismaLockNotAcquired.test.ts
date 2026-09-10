import { describe, it, expect } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import {
  isPrismaLockNotAcquired,
  isPrismaRecordNotFound,
} from './isPrismaLockNotAcquired'

describe('isPrismaLockNotAcquired', () => {
  it('returns true for P2010 with SQLSTATE 22012 in meta.code', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `22012`. Message: `division by zero`',
      {
        code: 'P2010',
        clientVersion: '5.12.1',
        meta: { code: '22012', message: 'division by zero' },
      }
    )
    expect(isPrismaLockNotAcquired(err)).toBe(true)
  })

  it('returns true for P2010 with SQLSTATE 22012 only in message', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `22012`. Message: `division by zero`',
      { code: 'P2010', clientVersion: '5.12.1' }
    )
    expect(isPrismaLockNotAcquired(err)).toBe(true)
  })

  it('returns false for P2010 with an unrelated SQLSTATE', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `55P03`. Message: `lock not available`',
      {
        code: 'P2010',
        clientVersion: '5.12.1',
        meta: { code: '55P03', message: 'lock not available' },
      }
    )
    expect(isPrismaLockNotAcquired(err)).toBe(false)
  })

  it('returns false for P2025', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.12.1',
    })
    expect(isPrismaLockNotAcquired(err)).toBe(false)
  })

  it('returns false for a plain Error instance', () => {
    expect(isPrismaLockNotAcquired(new Error('boom'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isPrismaLockNotAcquired(null)).toBe(false)
    expect(isPrismaLockNotAcquired(undefined)).toBe(false)
    expect(isPrismaLockNotAcquired('string')).toBe(false)
  })
})

describe('isPrismaRecordNotFound', () => {
  it('returns true for P2025', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.12.1',
    })
    expect(isPrismaRecordNotFound(err)).toBe(true)
  })

  it('returns false for a non-P2025 PrismaClientKnownRequestError', () => {
    const err = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2010',
      clientVersion: '5.12.1',
    })
    expect(isPrismaRecordNotFound(err)).toBe(false)
  })

  it('returns false for a plain Error instance', () => {
    expect(isPrismaRecordNotFound(new Error('boom'))).toBe(false)
  })
})
