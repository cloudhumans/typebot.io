import prisma from '@typebot.io/lib/prisma'
import { TRPCError } from '@trpc/server'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'

type GroupLike = {
  blocks: Array<{ type: string; options?: unknown }>
}

const linkedTypebotIds = (groups: GroupLike[], selfId: string): string[] => {
  const ids = new Set<string>()
  for (const group of groups) {
    for (const block of group.blocks) {
      if (block.type !== LogicBlockType.TYPEBOT_LINK) continue
      const target = (block.options as { typebotId?: unknown } | undefined)
        ?.typebotId
      if (
        typeof target !== 'string' ||
        target === 'current' ||
        target === selfId
      )
        continue
      ids.add(target)
    }
  }
  return [...ids]
}

export const assertLinkedTypebotsInWorkspace = async ({
  rootId,
  workspaceId,
  groups,
}: {
  rootId: string
  workspaceId: string
  groups: GroupLike[]
}): Promise<void> => {
  const visited = new Set<string>([rootId])
  const pending = linkedTypebotIds(groups, rootId)
  while (pending.length > 0) {
    const id = pending.pop() as string
    if (visited.has(id)) continue
    visited.add(id)
    const linked = await prisma.typebot.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, groups: true },
    })
    if (!linked)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Typebot ${rootId} links to typebot ${id}, which does not exist. Fix or remove that Typebot link block before running the draft.`,
      })
    if (linked.workspaceId !== workspaceId)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Typebot ${rootId} links to typebot ${id}, which belongs to another workspace. Headless runs only follow links inside the draft's own workspace.`,
      })
    pending.push(...linkedTypebotIds(linked.groups as GroupLike[], id))
  }
}
