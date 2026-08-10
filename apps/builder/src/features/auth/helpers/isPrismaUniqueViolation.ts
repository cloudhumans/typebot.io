import { Prisma } from '@typebot.io/prisma'

export const isPrismaUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
