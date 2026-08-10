import { env } from '@typebot.io/env'
import { badRequest } from '@typebot.io/lib/api'
import { OAuth2Client } from 'google-auth-library'
import { NextApiRequest, NextApiResponse } from 'next'

export const googleSheetsScopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
]

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const oauth2Client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${env.NEXTAUTH_URL}/api/credentials/google-sheets/callback`
    )
    // Only persist the fields the callback actually reads. Crucially, strip the
    // query string off redirectUrl (the callback does `redirectUrl.split('?')[0]`
    // anyway): in embedded mode it carries a multi-KB Cognito JWT that, once
    // base64-encoded into `state`, blows the OAuth redirect's `Location` header
    // past the ingress header limit → 502. Keeping `state` minimal also stops the
    // JWT from leaking into Google's URL and logs.
    // req.query values are `string | string[] | undefined`; normalize to a single
    // string so `state` never carries arrays/undefined that the callback (which
    // treats these as strings, e.g. `redirectUrl.split`) can't handle.
    const firstValue = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value
    const typebotId = firstValue(req.query.typebotId)
    const blockId = firstValue(req.query.blockId)
    const workspaceId = firstValue(req.query.workspaceId)
    const redirectUrl = firstValue(req.query.redirectUrl)
    // Defense in depth: fail early instead of generating a consent URL with an
    // `undefined`-laden state that the callback can't act on. The embedded
    // bootstrap already validates these client-side; this covers standalone and
    // direct hits.
    if (!typebotId || !blockId || !workspaceId || !redirectUrl)
      return badRequest(res)
    const state = Buffer.from(
      JSON.stringify({
        typebotId,
        blockId,
        workspaceId,
        redirectUrl: redirectUrl.split('?')[0],
      })
    ).toString('base64')
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: googleSheetsScopes,
      prompt: 'consent',
      state,
    })
    res.status(301).redirect(url)
  }
}

export default handler
