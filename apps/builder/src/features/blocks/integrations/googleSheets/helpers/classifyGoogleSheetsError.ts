export type GoogleSheetsAccessError = 'FORBIDDEN' | 'NOT_FOUND' | 'UNKNOWN'

const readStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return
  const response = (error as { response?: { status?: unknown } }).response
  if (typeof response?.status === 'number') return response.status
  const code = (error as { code?: unknown }).code
  return typeof code === 'number' ? code : undefined
}

export const classifyGoogleSheetsError = (
  error: unknown
): GoogleSheetsAccessError => {
  const status = readStatus(error)
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  return 'UNKNOWN'
}
