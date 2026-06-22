// Shared contract for the Google Sheets OAuth + Picker popup flow.
//
// Why popups: when the builder runs embedded inside CloudChat (an iframe on a
// different origin), Google refuses to render its consent / account-chooser
// screens (Sec-Fetch-Dest: iframe → 403) and partitions cookies/storage. We run
// both the OAuth connect and the Drive Picker in a top-level popup that escapes
// the iframe sandbox, then hand the result back to the opener via postMessage.

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
  spreadsheetId: string
}

// Narrows an untrusted postMessage payload to the "connected" message. Callers
// must still validate `event.origin` against `window.location.origin` first.
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

// Narrows an untrusted postMessage payload to the "spreadsheet picked" message.
// Callers must still validate `event.origin` against `window.location.origin`.
export const parseGoogleSheetsSpreadsheetPickedMessage = (
  data: unknown
): GoogleSheetsSpreadsheetPickedMessage | null => {
  if (typeof data !== 'object' || data === null) return null
  const message = data as Record<string, unknown>
  if (message.type !== GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE) return null
  if (typeof message.spreadsheetId !== 'string') return null
  return {
    type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
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
