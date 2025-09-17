import { TypebotHistoryContent } from '@/features/editor/providers/TypebotProvider'
import { TypebotV6 } from '@typebot.io/schemas'
import { EventType } from '@typebot.io/schemas/features/events/constants'
import { createId } from '@paralleldrive/cuid2'

export const parseTypebotHistory = (
  history: TypebotHistoryContent
): Omit<TypebotV6, 'id' | 'createdAt' | 'updatedAt'> => {
  const events: [TypebotV6['events'][0]] =
    history.events && history.events.length > 0
      ? [history.events[0]]
      : [
          {
            type: EventType.START,
            id: createId(),
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
    whatsAppCredentialsId: null,
  }
}
