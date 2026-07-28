import { IntegrationBlockType } from '@typebot.io/schemas/features/blocks/integrations/constants'
import { Coordinates } from './types'

// Server-side integration blocks with an observable result: the preview shows a
// spinner while they run and a green/red badge once they are done (HTTP
// request, the webhook family and Google Sheets). Kept here so the spinner
// (WebPreview) and the badge (BlockNode) can never drift apart.
export const executionStatusBlockTypes: string[] = [
  IntegrationBlockType.WEBHOOK,
  IntegrationBlockType.ZAPIER,
  IntegrationBlockType.MAKE_COM,
  IntegrationBlockType.PABBLY_CONNECT,
  IntegrationBlockType.GOOGLE_SHEETS,
]

export const stubLength = 20
export const groupWidth = 300
export const groupAnchorsOffset = {
  left: {
    x: 0,
    y: stubLength,
  },
  top: {
    x: groupWidth / 2,
    y: 0,
  },
  right: {
    x: groupWidth,
    y: stubLength,
  },
}
export const eventWidth = 200

export const graphPositionDefaultValue = (
  firstGroupCoordinates: Coordinates
) => ({
  x: 400 - firstGroupCoordinates.x,
  y: 100 - firstGroupCoordinates.y,
  scale: 1,
})

export const pathRadius = 20
