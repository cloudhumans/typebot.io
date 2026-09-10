import { Prisma } from '@typebot.io/prisma'

const PG_DIVISION_BY_ZERO = '22012'

const rawErrorSqlState = (e: Prisma.PrismaClientKnownRequestError) => {
  const metaCode = (e.meta as { code?: unknown } | undefined)?.code
  if (typeof metaCode === 'string') return metaCode
  const match = e.message.match(/Code: `?(\w{5})`?/)
  return match?.[1]
}

export const isPrismaLockNotAcquired = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2010' &&
  rawErrorSqlState(e) === PG_DIVISION_BY_ZERO

export const isPrismaRecordNotFound = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
