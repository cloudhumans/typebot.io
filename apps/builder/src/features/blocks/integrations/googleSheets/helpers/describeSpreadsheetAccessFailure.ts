import type { OAuth2Client } from 'google-auth-library'
import {
  GoogleSheetsAccessError,
  classifyGoogleSheetsError,
} from './classifyGoogleSheetsError'
import { getCredentialsAccountEmail } from './getCredentialsAccountEmail'

export type SpreadsheetAccessFailure = {
  error: GoogleSheetsAccessError
  credentialsName: string
  accountEmail?: string
}

export const describeSpreadsheetAccessFailure = async (
  err: unknown,
  client: OAuth2Client,
  credentialsName: string
): Promise<SpreadsheetAccessFailure> => {
  const error = classifyGoogleSheetsError(err)
  if (error !== 'FORBIDDEN') return { error, credentialsName }
  return {
    error,
    credentialsName,
    accountEmail: await getCredentialsAccountEmail(client, credentialsName),
  }
}
