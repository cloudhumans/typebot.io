import { z } from '../../zod'
import { publicTypebotSchemaV5, publicTypebotSchemaV6 } from '../publicTypebot'
import { preprocessTypebot } from '../typebot/helpers/preprocessTypebot'
import { settingsSchema } from '../typebot/settings'

const typebotInSessionStatePick = {
  version: true,
  id: true,
  groups: true,
  events: true,
  edges: true,
  variables: true,
  typebotId: true,
} as const

const typebotInSessionBaseSchema = z.preprocess(
  preprocessTypebot,
  z.discriminatedUnion('version', [
    publicTypebotSchemaV5._def.schema.pick(typebotInSessionStatePick),
    publicTypebotSchemaV6.pick(typebotInSessionStatePick),
  ])
)

// Additional fields for logging context — optional for backward compatibility
// with existing serialized sessions that lack these fields.
const sessionLoggingFieldsSchema = z.object({
  name: z.string().optional(),
  workspaceId: z.string().optional(),
  workspaceName: z.string().optional(),
  typebotHistoryId: z.string().optional(),
  // Carried so the engine can detect TOOL-mode flows (settings.general.type
  // === 'TOOL'). Optional for backward compatibility with existing serialized
  // sessions created before this field was added.
  settings: settingsSchema.optional(),
})

export const typebotInSessionStateSchema = typebotInSessionBaseSchema.and(
  sessionLoggingFieldsSchema
)
export type TypebotInSession = z.infer<typeof typebotInSessionStateSchema>

export const dynamicThemeSchema = z.object({
  hostAvatarUrl: z.string().optional(),
  guestAvatarUrl: z.string().optional(),
})
