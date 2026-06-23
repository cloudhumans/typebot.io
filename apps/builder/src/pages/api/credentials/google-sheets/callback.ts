import { NextApiRequest, NextApiResponse } from 'next'
import { Prisma } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { googleSheetsScopes } from './consent-url'
import { badRequest, notAuthenticated } from '@typebot.io/lib/api'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { env } from '@typebot.io/env'
import { encrypt } from '@typebot.io/lib/api/encryption/encrypt'
import { OAuth2Client } from 'google-auth-library'
import { parseGroups } from '@typebot.io/schemas'
import logger from '@/helpers/logger'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await getAuthenticatedUser(req, res)
  if (!user) return notAuthenticated(res)
  const state = req.query.state as string | undefined
  if (!state) return badRequest(res)
  const { typebotId, redirectUrl, blockId, workspaceId } = JSON.parse(
    Buffer.from(state, 'base64').toString()
  )
  if (req.method === 'GET') {
    const code = req.query.code as string | undefined
    if (!workspaceId) return badRequest(res)
    // blockId comes from the untrusted state and is later interpolated into
    // redirect URLs / query params; reject a malformed state rather than emit
    // `blockId=undefined` or `[object Object]`.
    if (typeof blockId !== 'string') return badRequest(res)
    if (!code)
      return res.status(400).send({ message: "Bad request, couldn't get code" })
    const oauth2Client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${env.NEXTAUTH_URL}/api/credentials/google-sheets/callback`
    )
    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens?.access_token) {
      logger.error('Error getting oAuth tokens:')
      throw new Error('ERROR')
    }
    oauth2Client.setCredentials(tokens)
    const { email, scopes } = await oauth2Client.getTokenInfo(
      tokens.access_token
    )
    if (!email)
      return res
        .status(400)
        .send({ message: "Couldn't get email from getTokenInfo" })
    if (googleSheetsScopes.some((scope) => !scopes.includes(scope)))
      return res
        .status(400)
        .send({ message: "User didn't accepted required scopes" })
    const { encryptedData, iv } = await encrypt(tokens)
    const credentials = {
      name: email,
      type: 'google sheets',
      workspaceId,
      data: encryptedData,
      iv,
    } satisfies Prisma.CredentialsUncheckedCreateInput
    const { id: credentialsId } = await prisma.credentials.create({
      data: credentials,
    })
    const typebot = await prisma.typebot.findFirst({
      where: {
        id: typebotId,
      },
      select: {
        version: true,
        groups: true,
      },
    })
    if (!typebot) return res.status(404).send({ message: 'Typebot not found' })
    const groups = parseGroups(typebot.groups, {
      typebotVersion: typebot.version,
    }).map((group) => {
      const block = group.blocks.find((block) => block.id === blockId)
      if (!block) return group
      return {
        ...group,
        blocks: group.blocks.map((block) => {
          if (block.id !== blockId || !('options' in block)) return block
          return {
            ...block,
            options: {
              ...block.options,
              credentialsId,
            },
          }
        }),
      }
    })
    await prisma.typebot.updateMany({
      where: {
        id: typebotId,
      },
      data: {
        groups,
      },
    })
    // The block already has credentialsId persisted above. Hand control to a
    // minimal completion page that, when opened as a popup (embedded mode),
    // postMessages the result back to the builder and closes itself. When there
    // is no opener (standalone, no popup) it falls back to the old behaviour of
    // redirecting the builder with `?blockId=`.
    // `redirectUrl` comes from the base64 `state`; guard that it's a string
    // before `.split` so a malformed state can't throw a 500.
    const redirectBase =
      typeof redirectUrl === 'string'
        ? redirectUrl.split('?')[0]
        : env.NEXTAUTH_URL
    const fallbackRedirectUrl = `${redirectBase}?blockId=${blockId}`
    const completeParams = new URLSearchParams({
      blockId,
      credentialsId,
      redirectUrl: fallbackRedirectUrl,
    })
    res.redirect(
      `${
        env.NEXTAUTH_URL
      }/credentials/google-sheets/callback-complete?${completeParams.toString()}`
    )
  }
}

export default handler
