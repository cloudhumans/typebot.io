import { authenticatedProcedure } from '@/helpers/server/trpc'
import { z } from 'zod'
import prisma from '@typebot.io/lib/prisma'
import { TRPCError } from '@trpc/server'

export const editingHeartbeat = authenticatedProcedure
  .input(z.object({ typebotId: z.string() }))
  .output(
    z.object({
      success: z.boolean(),
      promoted: z.boolean().optional(),
      isEditor: z.boolean(),
      position: z.number().nullable(), // 1=editor, >=2 aguardando
      editorEmail: z.string().nullable(),
    })
  )
  .mutation(async ({ input: { typebotId }, ctx: { user } }) => {
    return await prisma.$transaction(async (tx: typeof prisma) => {
      const typebotExists = await tx.typebot.findUnique({
        where: { id: typebotId },
        select: { id: true },
      })
      if (!typebotExists)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Typebot not found' })

      const now = new Date()
      const timeoutMs = 30000
      let promoted = false

      // Carrega fila
      const raw = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })
      // Normaliza posições
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

      // Expira editor por timeout
      const editor =
        raw.find((r: (typeof raw)[number]) => r.position === 1) || null
      if (
        editor &&
        editor.lastHeartbeatAt &&
        now.getTime() - editor.lastHeartbeatAt.getTime() > timeoutMs
      ) {
        await tx.typebotEditQueue.delete({ where: { id: editor.id } })
        // Reajusta posições remanescentes
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
      }

      // Recarrega pós expiração
      const queue = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })

      const myEntry =
        queue.find((q: (typeof queue)[number]) => q.userId === user.id) || null

      // Atualiza heartbeat (se já está na fila)
      if (myEntry) {
        await tx.typebotEditQueue.update({
          where: { id: myEntry.id },
          data: { lastHeartbeatAt: now },
        })
        myEntry.lastHeartbeatAt = now
      }

      // Se não existe editor atualmente (posição 1 livre) promover primeiro da fila
      const currentEditor =
        queue.find((q: (typeof queue)[number]) => q.position === 1) || null
      if (!currentEditor) {
        if (!myEntry) {
          // inserir como editor
          await tx.typebotEditQueue.create({
            data: {
              typebotId,
              userId: user.id,
              position: 1,
              userEmail: user.email,
              userName: user.name,
              lastHeartbeatAt: now,
            },
          })
          promoted = true
        } else if (myEntry.position !== 1) {
          // promover este usuário
          const oldPos = myEntry.position
          // incrementa posições anteriores (< oldPos)
          for (const q of queue) {
            if (q.id === myEntry!.id) continue
            if (q.position < oldPos) {
              await tx.typebotEditQueue.update({
                where: { id: q.id },
                data: { position: q.position + 1 },
              })
            }
          }
          await tx.typebotEditQueue.update({
            where: { id: myEntry.id },
            data: { position: 1, lastHeartbeatAt: now },
          })
          promoted = true
        }
      }

      // Fila final após possíveis mudanças
      const finalQueue = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })
      const finalMe =
        finalQueue.find(
          (q: (typeof finalQueue)[number]) => q.userId === user.id
        ) || null
      const finalEditor =
        finalQueue.find((q: (typeof finalQueue)[number]) => q.position === 1) ||
        null
      return {
        success: true,
        promoted,
        isEditor: finalMe?.position === 1,
        position: finalMe?.position ?? null,
        editorEmail: finalEditor?.userEmail ?? null,
      }
    })
  })
