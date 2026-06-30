import { useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import type { GoogleSheetsBlock, TypebotV6 } from '@typebot.io/schemas'
import { IntegrationBlockType } from '@typebot.io/schemas/features/blocks/integrations/constants'
import {
  GOOGLE_SHEETS_OAUTH_CHANNEL,
  parseGoogleSheetsConnectedMessage,
  parseGoogleSheetsSpreadsheetPickedMessage,
} from '../helpers/popupMessaging'

// Durable listener for both Google Sheets popup results (OAuth connect + Drive
// Picker). Both flows run in a top-level popup (embedded mode can't render
// Google's UI inside CloudChat's iframe). A popup can resolve long after it was
// opened — by then the user might have closed the block's settings panel or
// selected another block, unmounting any listener that lived in the panel.
//
// - connect: the callback persists credentialsId server-side, but if the editor
//   doesn't mirror it in memory the next autosave writes stale groups over it.
// - picked: the spreadsheetId is NOT persisted server-side, so a lost message
//   silently drops the selection.
//
// So the listener is mounted at the editor root (EditorPage), which stays
// mounted for the whole session, and applies the result to the block named by
// message.blockId regardless of which block is selected. The popup hands results
// over a same-origin BroadcastChannel rather than window.opener (COOP can sever
// the opener across the Google navigation); see popupMessaging.ts. State is read
// from refs so the listener stays registered once for the session.

// Locates a Google Sheets block by id and returns its indices. Returns null if
// no block matches or the matched block isn't a Google Sheets block — a
// malformed same-origin message (or a blockId pointing at another block type)
// must not inject options into the wrong block and corrupt the schema.
const findGoogleSheetsBlock = (
  typebot: TypebotV6,
  blockId: string
): { groupIndex: number; blockIndex: number } | null => {
  for (let groupIndex = 0; groupIndex < typebot.groups.length; groupIndex++) {
    const blockIndex = typebot.groups[groupIndex].blocks.findIndex(
      (block) => block.id === blockId
    )
    if (blockIndex === -1) continue
    const block = typebot.groups[groupIndex].blocks[blockIndex]
    if (block.type !== IntegrationBlockType.GOOGLE_SHEETS) return null
    return { groupIndex, blockIndex }
  }
  return null
}

export const useGoogleSheetsOAuthListener = () => {
  const { typebot, updateBlock } = useTypebot()
  const trpcContext = trpc.useContext()

  const typebotRef = useRef(typebot)
  typebotRef.current = typebot
  const updateBlockRef = useRef(updateBlock)
  updateBlockRef.current = updateBlock

  useEffect(() => {
    const channel = new BroadcastChannel(GOOGLE_SHEETS_OAUTH_CHANNEL)

    // Merges into existing options so sibling fields the user may have set
    // (spreadsheetId, sheetId, action, ...) are preserved.
    const applyOptions = (
      blockId: string,
      patch: Partial<NonNullable<GoogleSheetsBlock['options']>>
    ): boolean => {
      const currentTypebot = typebotRef.current
      if (!currentTypebot) return false
      const indices = findGoogleSheetsBlock(currentTypebot, blockId)
      if (!indices) return false
      const block =
        currentTypebot.groups[indices.groupIndex].blocks[indices.blockIndex]
      // findGoogleSheetsBlock already verified the type; narrow for options.
      const options = ('options' in block ? block.options : undefined) as
        | GoogleSheetsBlock['options']
        | undefined
      updateBlockRef.current(indices, {
        options: { ...options, ...patch },
      } as Partial<GoogleSheetsBlock>)
      return true
    }

    channel.onmessage = (event: MessageEvent) => {
      const connected = parseGoogleSheetsConnectedMessage(event.data)
      if (connected) {
        // Only refresh the credentials list when an update actually happened.
        if (
          applyOptions(connected.blockId, {
            credentialsId: connected.credentialsId,
          })
        )
          trpcContext.credentials.listCredentials.invalidate()
        return
      }
      const picked = parseGoogleSheetsSpreadsheetPickedMessage(event.data)
      if (picked) {
        // Matches GoogleSheetsSettings' handleSpreadsheetIdChange: set
        // spreadsheetId without clearing sheetId (no regression).
        applyOptions(picked.blockId, { spreadsheetId: picked.spreadsheetId })
      }
    }
    return () => channel.close()
  }, [trpcContext])
}
