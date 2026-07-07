import prisma from '@typebot.io/lib/prisma'
import { sanitizeToolName } from '@typebot.io/lib/sanitizeToolName'

/**
 * A tool's MCP name is `sanitizeToolName(name)` and doubles as its identity in
 * `tools/call`. Two non-archived tools resolving to the same sanitized name in
 * the same tenant would make the lookup ambiguous, so creation must reject it.
 */
export const isToolNameTaken = async ({
  name,
  tenant,
}: {
  name: string
  tenant: string
}): Promise<boolean> => {
  const target = sanitizeToolName(name)
  const existingTools = await prisma.typebot.findMany({
    where: {
      tenant,
      isArchived: { not: true },
      settings: { path: ['general', 'type'], equals: 'TOOL' },
    },
    select: { name: true },
  })
  return existingTools.some((tool) => sanitizeToolName(tool.name) === target)
}
