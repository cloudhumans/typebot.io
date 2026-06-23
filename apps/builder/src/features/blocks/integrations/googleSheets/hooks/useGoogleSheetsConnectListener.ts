import { useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import type { GoogleSheetsBlock } from '@typebot.io/schemas'
import {
  GOOGLE_SHEETS_OAUTH_CHANNEL,
  parseGoogleSheetsConnectedMessage,
} from '../helpers/popupMessaging'

// Durable listener for the Google Sheets OAuth connect result.
//
// The connect flow runs in a top-level popup (embedded mode can't render
// Google's consent inside CloudChat's iframe). The popup may resolve long after
// it was opened — by then the user might have closed the block's settings panel
// or selected another block, which would unmount a listener living in
// GoogleSheetsSettings. The callback has already persisted credentialsId on the
// block server-side, but if the editor doesn't mirror it in memory the next
// autosave writes the stale `groups` back over it, dropping the credential.
//
// So this listener is mounted at the editor root (EditorPage), which stays
// mounted for the whole editing session, and applies the credentialsId to the
// block named by message.blockId regardless of which block is selected. State
// is read from refs so the listener stays registered once for the session.
//
// The popup hands the result over a same-origin BroadcastChannel rather than
// window.opener (COOP can sever the opener across the Google OAuth navigation);
// see popupMessaging.ts.
export const useGoogleSheetsConnectListener = () => {
  const { typebot, updateBlock } = useTypebot()
  const trpcContext = trpc.useContext()

  const typebotRef = useRef(typebot)
  typebotRef.current = typebot
  const updateBlockRef = useRef(updateBlock)
  updateBlockRef.current = updateBlock

  useEffect(() => {
    const channel = new BroadcastChannel(GOOGLE_SHEETS_OAUTH_CHANNEL)
    channel.onmessage = (event: MessageEvent) => {
      const message = parseGoogleSheetsConnectedMessage(event.data)
      if (!message) return

      const currentTypebot = typebotRef.current
      if (!currentTypebot) return
      for (
        let groupIndex = 0;
        groupIndex < currentTypebot.groups.length;
        groupIndex++
      ) {
        const blockIndex = currentTypebot.groups[groupIndex].blocks.findIndex(
          (block) => block.id === message.blockId
        )
        if (blockIndex === -1) continue
        const block = currentTypebot.groups[groupIndex].blocks[blockIndex]
        // Merge into existing options so we don't clobber sibling option fields
        // the user may have set (spreadsheetId, sheetId, action, ...).
        const options = ('options' in block ? block.options : undefined) as
          | GoogleSheetsBlock['options']
          | undefined
        updateBlockRef.current({ groupIndex, blockIndex }, {
          options: { ...options, credentialsId: message.credentialsId },
        } as Partial<GoogleSheetsBlock>)
        break
      }
      trpcContext.credentials.listCredentials.invalidate()
    }
    return () => channel.close()
  }, [trpcContext])
}
