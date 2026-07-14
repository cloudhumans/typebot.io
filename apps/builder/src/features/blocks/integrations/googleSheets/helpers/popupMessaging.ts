// Shared contract for the Google Sheets OAuth + Picker popup flow.
//
// Why popups: when the builder runs embedded inside CloudChat (an iframe on a
// different origin), Google refuses to render its consent / account-chooser
// screens (Sec-Fetch-Dest: iframe → 403) and partitions cookies/storage. We run
// both the OAuth connect and the Drive Picker in a top-level popup that escapes
// the iframe sandbox, then hand the result back to the builder.
//
// Return transport: the OAuth connect popup navigates to Google and back, which
// COOP can use to sever window.opener (a browsing-context-group switch the spec
// never restores), so it returns over a same-origin BroadcastChannel. But
// BroadcastChannel is storage-partitioned: a builder embedded cross-site is in a
// different partition than the top-level popup and never receives it. The Picker
// popup never navigates cross-origin (the Picker is an overlay), so it keeps its
// opener and additionally posts via window.opener.postMessage, which crosses the
// partition boundary. Both message types share the channel and a listener
// filters by message `type`; the picked message is also delivered via opener.
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
