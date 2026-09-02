import prisma from '@typebot.io/lib/prisma'
import { Prisma } from '@typebot.io/prisma'
import { Settings } from '@typebot.io/schemas'

type Props = {
  publicId: string
}

export const findPublicTypebot = async ({ publicId }: Props) => {
  const byPublicId = await queryPublicTypebot({ typebot: { publicId } })
  if (byPublicId) return byPublicId
  const byTypebotId = await queryPublicTypebot({ typebotId: publicId })
  if (!byTypebotId) return null
  const type = (byTypebotId.settings as Settings | null)?.general?.type
  return type === 'CONTEXT_ENRICHMENT' ? byTypebotId : null
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
