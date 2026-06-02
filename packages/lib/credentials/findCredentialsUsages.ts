import { Prisma, PrismaClient } from '@typebot.io/prisma'
import prisma from '../prisma'

export type CredentialUsage = {
  source: 'Typebot' | 'PublicTypebot'
  typebotId: string
  publicId: string | null
  name: string
}

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// Finds every flow in the workspace that references a given credentialsId,
// either via blocks[].options.credentialsId (JSONB) or via the dedicated
// Typebot.whatsAppCredentialsId column. Pass a tx client to run inside an
// existing transaction (e.g. to eliminate race against publish-between-check
// scenarios when used as part of a delete guard).
export const findCredentialsUsages = async (
  credentialsId: string,
  workspaceId: string,
  tx?: PrismaTx
): Promise<CredentialUsage[]> => {
  const client = tx ?? prisma

  const jsonbUsages = await client.$queryRaw<CredentialUsage[]>(Prisma.sql`
    SELECT 'Typebot'::text AS source,
           t.id            AS "typebotId",
           t."publicId"    AS "publicId",
           t.name          AS name
    FROM "Typebot" t,
         jsonb_array_elements(t.groups) grp,
         jsonb_array_elements(COALESCE(grp->'blocks', '[]'::jsonb)) block
    WHERE t."workspaceId" = ${workspaceId}
      AND t."isArchived" = false
      AND block->'options'->>'credentialsId' = ${credentialsId}

    UNION

    SELECT 'PublicTypebot'::text AS source,
           pt."typebotId"        AS "typebotId",
           t."publicId"          AS "publicId",
           t.name                AS name
    FROM "PublicTypebot" pt
    JOIN "Typebot" t ON t.id = pt."typebotId"
    CROSS JOIN LATERAL jsonb_array_elements(pt.groups) grp
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(grp->'blocks', '[]'::jsonb)) block
    WHERE t."workspaceId" = ${workspaceId}
      AND block->'options'->>'credentialsId' = ${credentialsId}
  `)

  const whatsappUsages = await client.typebot.findMany({
    where: {
      workspaceId,
      whatsAppCredentialsId: credentialsId,
      isArchived: false,
    },
    select: { id: true, publicId: true, name: true },
  })

  const whatsappMapped: CredentialUsage[] = whatsappUsages.map((t) => ({
    source: 'Typebot',
    typebotId: t.id,
    publicId: t.publicId,
    name: t.name,
  }))

  const dedup = new Map<string, CredentialUsage>()
  for (const u of [...jsonbUsages, ...whatsappMapped]) {
    dedup.set(`${u.source}:${u.typebotId}`, u)
  }
  return Array.from(dedup.values())
}
