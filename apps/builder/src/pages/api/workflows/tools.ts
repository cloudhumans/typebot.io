import prisma from '@typebot.io/lib/prisma'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import NextCors from 'nextjs-cors'
import type { JsonValue } from '@typebot.io/prisma'

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
        variables: true,
        publicId: true,
        groups: true,
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
      .map((typebot) => {
        const typebotVariables = typebot.variables as {
          id: string
          name?: string
          description?: string
        }[]
        const groups = typebot.groups as JsonValue[]
        const declareVariablesBlocks = (groups as { blocks?: JsonValue[] }[])
          .flatMap((g) => g.blocks || [])
          .filter((b) => (b as { type?: string }).type === 'Declare variables')
        const declaredVariables = declareVariablesBlocks.flatMap(
          (b) =>
            (b as { options?: { variables?: JsonValue[] } }).options
              ?.variables || []
        )

        let variables = declaredVariables
          .map((v) => {
            const vObj = v as { variableId?: string; description?: string }
            const variable = typebotVariables.find(
              (tv) => tv.id === vObj.variableId
            )
            return {
              name: variable?.name,
              description: vObj.description,
            }
          })
          .filter((v) => v.name)

        if (variables.length === 0) {
          variables = typebotVariables
            .filter((v) => v.name && v.description)
            .map((v) => ({
              name: v.name,
              description: v.description,
            }))
        }

        const slug = typebot.name
          .toLowerCase()
          .replace(/_/g, '-')
          .replace(/\s+/g, '-')
          .replace(/[^\w-]+/g, '')

        return {
          id: typebot.id,
          name: typebot.name,
          tenant: typebot.tenant!,
          description: typebot.toolDescription!, // Maps to description in DTO
          isPublished: Boolean(typebot.publishedTypebot),
          variables,
          publicName: typebot.publicId ?? `${slug}-${typebot.id.slice(-7)}`,
        }
      })

    return res.status(200).json({ tools })
  } catch (error) {
    console.error('Failed to list tools:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
