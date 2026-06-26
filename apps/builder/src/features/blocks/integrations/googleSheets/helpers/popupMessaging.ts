// Shared contract for the Google Sheets OAuth + Picker popup flow.
//
// Why popups: when the builder runs embedded inside CloudChat (an iframe on a
// different origin), Google refuses to render its consent / account-chooser
// screens (Sec-Fetch-Dest: iframe → 403) and partitions cookies/storage. We run
// both the OAuth connect and the Drive Picker in a top-level popup that escapes
// the iframe sandbox, then hand the result back over a same-origin
// BroadcastChannel.
//
// Why BroadcastChannel instead of window.opener.postMessage: after a popup
// navigates to Google's OAuth and back, COOP can sever window.opener (a
// browsing-context-group switch the spec never restores). BroadcastChannel is
// same-origin and opener-independent — the popup returns to our origin
// (callback-complete / google-picker) and posts; the builder on the same origin
// receives it regardless. A single channel carries both message types; each
// listener filters by message `type`.
export const GOOGLE_SHEETS_OAUTH_CHANNEL = 'google-sheets-oauth' as const

export const GOOGLE_SHEETS_CONNECTED_MESSAGE =
  'google-sheets-connected' as const
export const GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE =
  'google-sheets-spreadsheet-picked' as const

export type GoogleSheetsConnectedMessage = {
  type: typeof GOOGLE_SHEETS_CONNECTED_MESSAGE
  blockId: string
  credentialsId: string
}

export type GoogleSheetsSpreadsheetPickedMessage = {
  type: typeof GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE
  blockId: string
  spreadsheetId: string
}

// Narrows an untrusted channel payload to the "connected" message. The channel
// is same-origin by design, so there's no origin to check — but we still
// validate the shape since any same-origin code could post to it.
export const parseGoogleSheetsConnectedMessage = (
  data: unknown
): GoogleSheetsConnectedMessage | null => {
  if (typeof data !== 'object' || data === null) return null
  const message = data as Record<string, unknown>
  if (message.type !== GOOGLE_SHEETS_CONNECTED_MESSAGE) return null
  if (
    typeof message.blockId !== 'string' ||
    typeof message.credentialsId !== 'string'
  )
    return null
  return {
    type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
    blockId: message.blockId,
    credentialsId: message.credentialsId,
  }
}

// Narrows an untrusted channel payload to the "spreadsheet picked" message. The
// channel is same-origin by design; we still validate the shape (and callers
// still match blockId to their own block).
export const parseGoogleSheetsSpreadsheetPickedMessage = (
  data: unknown
): GoogleSheetsSpreadsheetPickedMessage | null => {
  if (typeof data !== 'object' || data === null) return null
  const message = data as Record<string, unknown>
  if (message.type !== GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE) return null
  if (
    typeof message.blockId !== 'string' ||
    typeof message.spreadsheetId !== 'string'
  )
    return null
  return {
    type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
    blockId: message.blockId,
    spreadsheetId: message.spreadsheetId,
  }
}

// Extracts the spreadsheet id from a Google Picker callback payload. The Picker
// only reports a selection when `action === 'picked'`; everything else (cancel,
// loaded, ...) yields null.
export const extractPickedSpreadsheetId = (data: {
  action?: string
  docs?: { id?: string }[]
}): string | null => {
  if (data.action !== 'picked') return null
  return data.docs?.[0]?.id ?? null
}
