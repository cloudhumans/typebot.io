import { z } from '../../zod'
import { publicTypebotSchemaV5, publicTypebotSchemaV6 } from '../publicTypebot'
import { preprocessTypebot } from '../typebot/helpers/preprocessTypebot'

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

// Optional fields merged onto the session typebot. Kept optional for backward
// compatibility with sessions serialized before each field existed (getSession
// parses stored state strictly, so a required field would break in-flight
// sessions). Covers both diagnostic/logging context (name, workspaceId, ...)
// and runtime-functional flags (isToolWorkflow, used to detect TOOL-mode flows).
const sessionLoggingFieldsSchema = z.object({
  name: z.string().optional(),
  workspaceId: z.string().optional(),
  workspaceName: z.string().optional(),
  typebotHistoryId: z.string().optional(),
  // Derived at session creation from settings.general.type === 'TOOL'. Carried
  // (instead of the full settings object) so the engine can detect TOOL-mode
  // flows without persisting unrelated config (customHeadCode, GTM, allowedOrigins).
  // Optional for backward compatibility with sessions created before this field.
  isToolWorkflow: z.boolean().optional(),
})

export const typebotInSessionStateSchema = typebotInSessionBaseSchema.and(
  sessionLoggingFieldsSchema
)
export type TypebotInSession = z.infer<typeof typebotInSessionStateSchema>

export const dynamicThemeSchema = z.object({
  hostAvatarUrl: z.string().optional(),
  guestAvatarUrl: z.string().optional(),
})
