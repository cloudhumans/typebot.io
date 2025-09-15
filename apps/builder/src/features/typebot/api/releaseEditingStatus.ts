import { authenticatedProcedure } from '@/helpers/server/trpc'
import { z } from 'zod'
import prisma from '@typebot.io/lib/prisma'
import { TRPCError } from '@trpc/server'

// Libera edição caso o usuário seja o editor atual.
// Após liberar, não promove automaticamente ninguém; a promoção ocorre via claim do primeiro da fila.
export const releaseEditingStatus = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{typebotId}/release-editing',
      protect: true,
      summary: 'Release editing status of a typebot',
      tags: ['Typebot'],
    },
  })
  .input(
    z.object({
      typebotId: z
        .string()
        .describe(
          "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)"
        ),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      released: z.boolean().optional(),
    })
  )
  .mutation(async ({ input: { typebotId }, ctx: { user } }) => {
    return await prisma.$transaction(async (tx: typeof prisma) => {
      const typebot = await tx.typebot.findUnique({
        where: { id: typebotId },
        select: { id: true },
      })
      if (!typebot)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Typebot not found' })

      const editorEntry = await tx.typebotEditQueue.findFirst({
        where: { typebotId, position: 1 },
        orderBy: { createdAt: 'asc' },
      })

      if (!editorEntry || editorEntry.userId !== user.id) {
        return { success: true, released: false }
      }

      // Remove editor
      await tx.typebotEditQueue.delete({ where: { id: editorEntry.id } })
      // Recompacta demais posições
      const rest = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })
      for (let i = 0; i < rest.length; i++) {
        const desired = i + 1
        if (rest[i].position !== desired) {
          await tx.typebotEditQueue.update({
            where: { id: rest[i].id },
            data: { position: desired },
          })
        }
      }
      return { success: true, released: true }
    })
  })
