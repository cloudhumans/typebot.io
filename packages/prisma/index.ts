import { PrismaClient } from '@prisma/client'
export * from '@prisma/client'

// Named export for enums to avoid vite barrel export bug (https://github.com/nrwl/nx/issues/13704)
export {
  Plan,
  WorkspaceRole,
  GraphNavigation,
  CollaborationType,
} from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

const prismaInstance =
  global.prisma ||
  new PrismaClient({
    log: ['warn', 'error'], // evite 'query' em prod
  })

if (process.env.NODE_ENV !== 'production') global.prisma = prismaInstance

// Script/test-only client (packages/scripts, Playwright fixtures). Unlike
// @typebot.io/lib/prisma, it has NO null-byte sanitizer middleware — runtime
// code must import the client from @typebot.io/lib/prisma instead.
export const prisma: PrismaClient = prismaInstance
