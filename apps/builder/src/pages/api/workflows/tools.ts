import prisma from '@typebot.io/lib/prisma'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import NextCors from 'nextjs-cors'

const querySchema = z.object({
  tenant: z.string().min(1),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await NextCors(req, res, {
    methods: ['GET', 'HEAD'],
    origin: '*',
    optionsSuccessStatus: 200,
  })

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getAuthenticatedUser(req, res)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const query = querySchema.safeParse(req.query)

  if (!query.success) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid tenant parameter' })
  }

  const { tenant } = query.data

  try {
    const typebots = await prisma.typebot.findMany({
      where: {
        tenant,
        isArchived: { not: true },
        toolDescription: { not: null },
      },
      select: {
        id: true,
        name: true,
        tenant: true,
        toolDescription: true,
        settings: true,
        publishedTypebot: {
          select: {
            id: true,
          },
        },
      },
    })

    const tools = typebots
      .filter((typebot) => {
        const settings = typebot.settings as { general?: { type?: string } }
        return (
          settings?.general?.type === 'AI_WORKFLOW' &&
          typebot.tenant &&
          typebot.toolDescription
        )
      })
      .map((typebot) => ({
        id: typebot.id,
        name: typebot.name,
        tenant: typebot.tenant!,
        description: typebot.toolDescription!, // Maps to description in DTO
        isPublished: Boolean(typebot.publishedTypebot),
      }))

    return res.status(200).json({ tools })
  } catch (error) {
    console.error('Failed to list tools:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
