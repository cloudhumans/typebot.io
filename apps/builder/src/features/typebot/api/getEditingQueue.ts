import { authenticatedProcedure } from '@/helpers/server/trpc'
import prisma from '@typebot.io/lib/prisma'
import { z } from 'zod'

export const getEditingQueue = authenticatedProcedure
  .input(z.object({ typebotId: z.string() }))
  .output(
    z.object({
      isEditor: z.boolean(),
      position: z.number().nullable(), // posição do caller (1=editor)
      queue: z.array(
        z.object({
          userId: z.string(),
          position: z.number(), // 1=editor, >=2 esperando
          lastHeartbeatAt: z.date().nullable(),
        })
      ),
    })
  )
  .query(async ({ input: { typebotId }, ctx: { user } }) => {
    const result = await prisma.$transaction(async (tx) => {
      // Carrega fila completa
      const raw = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { email: true, name: true } },
        },
      })

      // Normalização de posições (garante sequência 1..n)
      for (let i = 0; i < raw.length; i++) {
        const desired = i + 1
        if (raw[i].position !== desired) {
          await tx.typebotEditQueue.update({
            where: { id: raw[i].id },
            data: { position: desired },
          })
          raw[i].position = desired
        }
      }

      const now = new Date()
      const timeoutMs = 30000

      // Expira editor (posição 1) se heartbeat antigo
      const editor = raw.find((r: (typeof raw)[number]) => r.position === 1)
      if (
        editor &&
        editor.lastHeartbeatAt &&
        now.getTime() - editor.lastHeartbeatAt.getTime() > timeoutMs
      ) {
        // Remove editor expirado
        await tx.typebotEditQueue.delete({ where: { id: editor.id } })
        const remaining = await tx.typebotEditQueue.findMany({
          where: { typebotId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            position: true,
          },
        })
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].position !== i + 1) {
            await tx.typebotEditQueue.update({
              where: { id: remaining[i].id },
              data: { position: i + 1 },
            })
          }
        }
      }

      // Recarrega após possível expiração
      const queueFull = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { email: true, name: true } },
        },
      })

      const myEntry =
        queueFull.find(
          (e: (typeof queueFull)[number]) => e.userId === user.id
        ) || null
      const isEditor = myEntry?.position === 1
      const editorEntry =
        queueFull.find((e: (typeof queueFull)[number]) => e.position === 1) ||
        null

      return {
        isEditor,
        position: myEntry?.position ?? null,
        queue: queueFull.map((e: (typeof queueFull)[number]) => ({
          userId: e.userId,
          position: e.position,
          lastHeartbeatAt: e.lastHeartbeatAt ?? null,
        })),
      }
    })
    return result
  })
