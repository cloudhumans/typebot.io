import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'

// Claim editing status: concede somente se não houver outro usuário editando.
export const claimEditingStatus = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/typebots/{typebotId}/claim-editing',
      protect: true,
      summary: 'Claim editing status of a typebot',
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
      alreadyOwned: z.boolean().optional(),
      isEditor: z.boolean().optional(),
      position: z.number().optional(), // posição após operação (1 se editor)
    })
  )
  .mutation(async ({ input: { typebotId }, ctx: { user } }) => {
    return await prisma.$transaction(async (tx) => {
      const existingTypebot = await tx.typebot.findFirst({
        where: { id: typebotId },
        select: {
          id: true,
          collaborators: { select: { userId: true, type: true } },
          workspace: {
            select: {
              isSuspended: true,
              isPastDue: true,
              members: { select: { userId: true, role: true } },
            },
          },
        },
      })

      if (
        !existingTypebot?.id ||
        (await isWriteTypebotForbidden(existingTypebot, user))
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Typebot not found' })
      }

      // Carrega fila atual
      const queue = await tx.typebotEditQueue.findMany({
        where: { typebotId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { user: { select: { email: true, name: true } } },
      })
      // Normaliza posições
      for (let i = 0; i < queue.length; i++) {
        const desired = i + 1
        if (queue[i].position !== desired) {
          await tx.typebotEditQueue.update({
            where: { id: queue[i].id },
            data: { position: desired },
          })
          queue[i].position = desired
        }
      }

      const editor =
        queue.find((q: (typeof queue)[number]) => q.position === 1) || null
      const mine =
        queue.find((q: (typeof queue)[number]) => q.userId === user.id) || null

      // Já sou editor
      if (mine && mine.position === 1) {
        await tx.typebotEditQueue.update({
          where: { id: mine.id },
          data: { lastHeartbeatAt: new Date() },
        })
        return {
          success: true,
          alreadyOwned: true,
          isEditor: true,
          position: 1,
        }
      }

      // Existe outro editor na posição 1 que não sou eu
      if (editor && editor.userId !== user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Already claimed' })
      }

      // Sem editor (fila vazia ou editor é o próprio usuário sem entrada)
      if (!editor) {
        if (!mine) {
          // Inserir como editor (posição 1) deslocando os demais
          // Incrementa posições existentes primeiro
          for (let i = queue.length - 1; i >= 0; i--) {
            await tx.typebotEditQueue.update({
              where: { id: queue[i].id },
              data: { position: queue[i].position + 1 },
            })
          }
          await tx.typebotEditQueue.create({
            data: {
              typebotId,
              userId: user.id,
              position: 1,
            },
          })
          return {
            success: true,
            isEditor: true,
            position: 1,
          }
        } else {
          // Usuário já está na fila esperando; promove a posição 1
          const currentPos = mine.position
          // Move todos com posição < currentPos uma casa para baixo? (eles devem subir)
          // Estratégia: setar mine.position = 1 e ++ os que eram < mine.position
          for (const q of queue) {
            if (q.id === mine.id) continue
            if (q.position < currentPos) {
              await tx.typebotEditQueue.update({
                where: { id: q.id },
                data: { position: q.position + 1 },
              })
            }
          }
          await tx.typebotEditQueue.update({
            where: { id: mine.id },
            data: { position: 1, lastHeartbeatAt: new Date() },
          })
          return {
            success: true,
            isEditor: true,
            position: 1,
          }
        }
      }

      // Chegou aqui significa que editor existe mas é o próprio usuário? (já tratado) ou conflito
      throw new TRPCError({ code: 'CONFLICT', message: 'Unable to claim' })
    })
  })
