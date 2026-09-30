export type GoogleSheetsAccessError =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_DOCUMENT'
  | 'UNKNOWN'

type ErrorLike = {
  code?: unknown
  message?: unknown
  response?: { status?: unknown; data?: unknown }
}

const readStatus = (error: ErrorLike): number | undefined => {
  if (typeof error.response?.status === 'number') return error.response.status
  return typeof error.code === 'number' ? error.code : undefined
}

const readText = (error: ErrorLike): string => {
  const data = error.response?.data
  const message = typeof error.message === 'string' ? error.message : ''
  if (typeof data === 'string') return `${message} ${data}`
  try {
    return `${message} ${JSON.stringify(data ?? '')}`
  } catch {
    return message
  }
}

export const classifyGoogleSheetsError = (
  error: unknown
): GoogleSheetsAccessError => {
  if (!error || typeof error !== 'object') return 'UNKNOWN'
  const errorLike = error as ErrorLike
  const status = readStatus(errorLike)
  const text = readText(errorLike)
  if (status === 401 || text.includes('invalid_grant')) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 400 && text.includes('not supported for this document'))
    return 'UNSUPPORTED_DOCUMENT'
  return 'UNKNOWN'
}
