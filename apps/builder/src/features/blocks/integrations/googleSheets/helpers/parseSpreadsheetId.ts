const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{25,}$/
const SPREADSHEET_URL_PATTERN =
  /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/

export const parseSpreadsheetId = (input: string): string | null => {
  const value = input.trim()
  if (!value) return null
  if (SPREADSHEET_ID_PATTERN.test(value)) return value
  const match = value.match(SPREADSHEET_URL_PATTERN)
  if (!match) return null
  return SPREADSHEET_ID_PATTERN.test(match[1]) ? match[1] : null
}
