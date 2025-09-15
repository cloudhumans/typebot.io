import { authenticatedProcedure } from '@/helpers/server/trpc'
import { z } from 'zod'
import prisma from '@typebot.io/lib/prisma'
import { TRPCError } from '@trpc/server'

export const joinEditingQueue = authenticatedProcedure
  .input(
    z.object({
      typebotId: z.string(),
    })
  )
  .output(
    z.object({
      position: z.number(), // 1 = editor
      isEditor: z.boolean(),
      editorEmail: z.string().nullable(),
      queue: z.array(
        z.object({
          userId: z.string(),
          position: z.number(),
          userEmail: z.string().nullable(),
          userName: z.string().nullable(),
        })
      ),
    })
  )
  .mutation(async ({ input: { typebotId }, ctx: { user } }) => {
    const typebotExists = await prisma.typebot.findUnique({
      where: { id: typebotId },
      select: { id: true },
    })
    if (!typebotExists)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Typebot not found' })

    // Idempotent join: create if missing, tolerate race duplicates
    let existing = await prisma.typebotEditQueue.findUnique({
      where: { typebotId_userId: { typebotId, userId: user.id } },
    })
    if (!existing) {
      const max = await prisma.typebotEditQueue.aggregate({
        where: { typebotId },
        _max: { position: true },
      })
      const position = (max._max.position ?? 0) + 1
      existing = await prisma.typebotEditQueue.create({
        data: {
          typebotId,
          userId: user.id,
          position,
          userEmail: user.email,
          userName: user.name,
        },
      })
    }

    // Normalizar posições (corrige possíveis buracos / duplicações decorrentes de corridas)
    const rawQueue = await prisma.typebotEditQueue.findMany({
      where: { typebotId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { email: true, name: true } },
      },
    })
    for (let i = 0; i < rawQueue.length; i++) {
      const desired = i + 1
      if (rawQueue[i].position !== desired) {
        await prisma.typebotEditQueue.update({
          where: { id: rawQueue[i].id },
          data: { position: desired },
        })
        rawQueue[i].position = desired
      }
    }
    const queue = rawQueue.map((q: (typeof rawQueue)[number]) => ({
      userId: q.userId,
      position: q.position,
      userEmail: q.userEmail ?? q.user?.email ?? null,
      userName: q.userName ?? q.user?.name ?? null,
    }))

    const my = queue.find((q: (typeof queue)[number]) => q.userId === user.id)!
    const editorEntry =
      queue.find((q: (typeof queue)[number]) => q.position === 1) || null
    const isEditor = my.position === 1
    return {
      position: my.position,
      isEditor,
      editorEmail: editorEntry?.userEmail ?? null,
      queue,
    }
  })
