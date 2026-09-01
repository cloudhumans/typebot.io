import prisma from '@typebot.io/lib/prisma'
import { Prisma } from '@typebot.io/prisma'

type Props = {
  publicId: string
}

export const findPublicTypebot = async ({ publicId }: Props) => {
  const byPublicId = await queryPublicTypebot({ typebot: { publicId } })
  if (byPublicId) return byPublicId
  return queryPublicTypebot({ typebotId: publicId })
}

const queryPublicTypebot = (where: Prisma.PublicTypebotWhereInput) =>
  prisma.publicTypebot.findFirst({
    where,
    select: {
      version: true,
      groups: true,
      events: true,
      edges: true,
      settings: true,
      theme: true,
      variables: true,
      typebotId: true,
      typebot: {
        select: {
          isArchived: true,
          isClosed: true,
          name: true,
          workspaceId: true,
          workspace: {
            select: {
              id: true,
              name: true,
              plan: true,
              customChatsLimit: true,
              isQuarantined: true,
              isSuspended: true,
            },
          },
        },
      },
    },
  })
