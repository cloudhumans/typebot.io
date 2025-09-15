import { authenticatedProcedure } from '@/helpers/server/trpc'
import { z } from 'zod'
import prisma from '@typebot.io/lib/prisma'

export const leaveEditingQueue = authenticatedProcedure
  .input(z.object({ typebotId: z.string() }))
  .output(z.object({ success: z.literal(true) }))
  .mutation(async ({ input: { typebotId }, ctx: { user } }) => {
    const existing = await prisma.typebotEditQueue.findUnique({
      where: { typebotId_userId: { typebotId, userId: user.id } },
    })
    if (!existing) return { success: true as const }

    await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.typebotEditQueue.delete({
        where: { typebotId_userId: { typebotId, userId: user.id } },
      })
      const rest = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: { position: 'asc' },
      })
      // Recompactar posições
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].position !== i + 1) {
          await tx.typebotEditQueue.update({
            where: { id: rest[i].id },
            data: { position: i + 1 },
          })
        }
      }
    })

    return { success: true as const }
  })
