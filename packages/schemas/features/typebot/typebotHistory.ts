import { z } from '../../zod'
import { EventType } from '../events/constants'
import { startEventSchema } from '../events/start/schema'
import { edgeSchema } from './edge'
import { groupV6Schema } from './group'
import { TypebotV6 } from './typebot'
import { variableSchema } from './variable'

// Using a type that matches TypebotHistoryContent from apps/builder/src/features/editor/providers/TypebotProvider
export const typebotHistoryContentSchema = z.object({
  name: z.string(),
  icon: z.string().nullable(),
  groups: z
    .array(z.lazy(() => z.any() as unknown as typeof groupV6Schema))
    .nullable(),
  events: z.array(startEventSchema).nullable(),
  variables: z
    .array(z.lazy(() => z.any() as unknown as typeof variableSchema))
    .nullable(),
  edges: z
    .array(z.lazy(() => z.any() as unknown as typeof edgeSchema))
    .nullable(),
  theme: z.record(z.any()).nullable(),
  settings: z.record(z.any()).nullable(),
  folderId: z.string().nullable(),
  selectedThemeTemplateId: z.string().nullable(),
  resultsTablePreferences: z.record(z.any()).nullable(),
  publicId: z.string().nullable(),
  customDomain: z.string().nullable(),
  workspaceId: z.string(),
  isArchived: z.boolean().optional(),
  isClosed: z.boolean().optional(),
  riskLevel: z.number().nullable(),
  whatsAppCredentialsId: z.string().nullable(),
})

export type TypebotHistoryContent = z.infer<typeof typebotHistoryContentSchema>

export const typebotHistorySchema = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  version: z.string(),
  origin: z.enum(['BUILDER', 'RESTORE', 'IMPORT', 'TEMPLATE', 'API']), // Matches TypebotHistoryOrigin
  author: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
  restoredFromId: z.string().nullable(),
  publishedAt: z.coerce.date().nullable(),
  isRestored: z.boolean(),
  content: typebotHistoryContentSchema.optional(),
})

export type TypebotHistory = z.infer<typeof typebotHistorySchema>

export const typebotHistoryResponseSchema = z.object({
  history: z.array(typebotHistorySchema),
  nextCursor: z.string().nullable(),
})

export type TypebotHistoryResponse = z.infer<
  typeof typebotHistoryResponseSchema
>

/**
 * Parses a TypebotHistoryContent object into a TypebotV6 object (minus id, createdAt, updatedAt)
 */
export const parseTypebotHistory = (
  history: TypebotHistoryContent
): Omit<TypebotV6, 'id' | 'createdAt' | 'updatedAt'> => {
  const events: [z.infer<typeof startEventSchema>] =
    history.events && history.events.length > 0
      ? [history.events[0]]
      : [
          {
            type: EventType.START,
            id: generateId(),
            graphCoordinates: { x: 0, y: 0 },
          },
        ]

  return {
    version: '6' as const,
    name: history.name,
    icon: history.icon,
    groups: history.groups || [],
    events,
    variables: history.variables || [],
    edges: history.edges || [],
    theme: history.theme || {},
    settings: history.settings || {},
    folderId: history.folderId || null,
    selectedThemeTemplateId: history.selectedThemeTemplateId || null,
    resultsTablePreferences: null,
    publicId: null,
    customDomain: null,
    workspaceId: history.workspaceId,
    isArchived: false,
    isClosed: false,
    riskLevel: null,
    whatsAppCredentialsId: history.whatsAppCredentialsId || null,
  }
}

/**
 * Creates a TypebotHistoryContent from a TypebotV6 object
 */
export const createTypebotHistoryContent = (
  typebot: TypebotV6
): TypebotHistoryContent => {
  return {
    name: typebot.name,
    icon: typebot.icon,
    groups: typebot.groups,
    events: typebot.events,
    variables: typebot.variables,
    edges: typebot.edges,
    theme: typebot.theme,
    settings: typebot.settings,
    folderId: typebot.folderId,
    selectedThemeTemplateId: typebot.selectedThemeTemplateId,
    resultsTablePreferences: typebot.resultsTablePreferences,
    publicId: typebot.publicId,
    customDomain: typebot.customDomain,
    workspaceId: typebot.workspaceId,
    isArchived: typebot.isArchived,
    isClosed: typebot.isClosed,
    riskLevel: typebot.riskLevel,
    whatsAppCredentialsId: typebot.whatsAppCredentialsId,
  }
}

/**
 * Generates a unique ID for internal use
 * A simple implementation that doesn't rely on external dependencies
 */
const generateId = (): string => {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `${timestamp}_${randomPart}`
}
