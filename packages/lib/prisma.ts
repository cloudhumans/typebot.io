import { env } from '@typebot.io/env'
import { PrismaClient } from '@typebot.io/prisma'
import { sanitizeNullBytes } from './sanitizeNullBytes'

declare const global: { prisma: PrismaClient }
let prisma: PrismaClient

if (env.NODE_ENV === 'production' && !process.versions.bun) {
  prisma = new PrismaClient({
    log: ['info', 'warn', 'error'],
  })
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['info', 'warn', 'error'],
    })
  }
  prisma = global.prisma
}

prisma.$use(async (params, next) => {
  const before = Date.now()
  const result = await next(params)
  const after = Date.now()

  return result
})

const NULL_BYTE_WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
])

prisma.$use(async (params, next) => {
  if (params.args && NULL_BYTE_WRITE_ACTIONS.has(params.action))
    params.args = sanitizeNullBytes(params.args)
  return next(params)
})

export default prisma
