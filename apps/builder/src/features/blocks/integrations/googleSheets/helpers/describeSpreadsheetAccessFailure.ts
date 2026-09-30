import type { OAuth2Client } from 'google-auth-library'
import {
  GoogleSheetsAccessError,
  classifyGoogleSheetsError,
} from './classifyGoogleSheetsError'
import { getCredentialsAccountEmail } from './getCredentialsAccountEmail'

export type SpreadsheetAccessFailure = {
  error: GoogleSheetsAccessError
  accountEmail: string
}

export const describeSpreadsheetAccessFailure = async (
  err: unknown,
  client: OAuth2Client,
  credentialsName: string
): Promise<SpreadsheetAccessFailure> => {
  const error = classifyGoogleSheetsError(err)
  return {
    error,
    accountEmail:
      error === 'FORBIDDEN'
        ? await getCredentialsAccountEmail(client, credentialsName)
        : credentialsName,
  }
}
