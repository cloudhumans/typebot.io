import { NextApiRequest, NextApiResponse } from 'next'
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { getAuthenticatedGoogleClient } from '@/lib/googleSheets'
import { isDefined } from '@typebot.io/lib'
import {
  badRequest,
  methodNotAllowed,
  notAuthenticated,
} from '@typebot.io/lib/api'
import { setUser } from '@sentry/nextjs'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import logger from '@/helpers/logger'
import { classifyGoogleSheetsError } from '@/features/blocks/integrations/googleSheets/helpers/classifyGoogleSheetsError'
import { getCredentialsAccountEmail } from '@/features/blocks/integrations/googleSheets/helpers/getCredentialsAccountEmail'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await getAuthenticatedUser(req, res)
  if (!user) return notAuthenticated(res)

  setUser({ id: user.id })
  if (req.method === 'GET') {
    const credentialsId = req.query.credentialsId as string | undefined
    if (!credentialsId) return badRequest(res)
    const spreadsheetId = req.query.id as string
    const auth = await getAuthenticatedGoogleClient(user, credentialsId)
    if (!auth)
      return res
        .status(404)
        .send({ message: "Couldn't find credentials in database" })
    const doc = new GoogleSpreadsheet(spreadsheetId, auth.client)
    try {
      await doc.loadInfo()
    } catch (err) {
      const accessError = classifyGoogleSheetsError(err)
      logger.warn('Could not load Google spreadsheet', {
        spreadsheetId,
        credentialsId,
        accessError,
      })
      if (accessError === 'FORBIDDEN')
        return res.status(403).send({
          message: `${await getCredentialsAccountEmail(
            auth.client,
            auth.credentials.name
          )} has no access to this spreadsheet`,
        })
      if (accessError === 'NOT_FOUND')
        return res.status(404).send({ message: 'Spreadsheet not found' })
      if (accessError === 'UNAUTHORIZED')
        return res.status(401).send({
          message: 'Google account connection expired, reconnect it',
        })
      if (accessError === 'UNSUPPORTED_DOCUMENT')
        return res
          .status(400)
          .send({ message: 'File is not a native Google Sheets spreadsheet' })
      return res.status(502).send({ message: "Couldn't load the spreadsheet" })
    }
    return res.send({
      sheets: (
        await Promise.all(
          Array.from(Array(doc.sheetCount)).map(async (_, idx) => {
            const sheet = doc.sheetsByIndex[idx]
            try {
              await sheet.loadHeaderRow()
            } catch (err) {
              if (err && typeof err === 'object' && 'message' in err)
                logger.error(err.message)
              return
            }
            return {
              id: sheet.sheetId.toString(),
              name: sheet.title,
              columns: sheet.headerValues,
            }
          })
        )
      ).filter(isDefined),
    })
  }
  return methodNotAllowed(res)
}

export default handler
