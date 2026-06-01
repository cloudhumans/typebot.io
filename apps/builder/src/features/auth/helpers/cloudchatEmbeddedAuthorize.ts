import { PrismaClient } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'
import logger from '@/helpers/logger'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { DatabaseUserWithCognito } from '@/features/auth/types/cognito'
import { findOrCreateCloudChatEmbeddedUser } from './findOrCreateCloudChatEmbeddedUser'

type Credentials = { token?: string } | undefined

type AuthorizedUser = Pick<
  DatabaseUserWithCognito,
  | 'id'
  | 'name'
  | 'email'
  | 'image'
  | 'emailVerified'
  | 'createdAt'
  | 'cognitoClaims'
  | 'cloudChatAuthorization'
  | 'cognitoTokenExp'
>

export const cloudchatEmbeddedAuthorize = async (
  p: PrismaClient,
  credentials: Credentials
): Promise<AuthorizedUser | null> => {
  try {
    if (!credentials?.token) return null

    const payload = await verifyCognitoToken({
      cognitoAppClientId: env.CLOUDCHAT_COGNITO_APP_CLIENT_ID,
      cognitoIssuerUrl: env.COGNITO_ISSUER_URL,
      cognitoToken: credentials.token,
    })

    const user = await findOrCreateCloudChatEmbeddedUser(p, payload)
    if (!user) return null

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      // Forwarded so the signIn callback's `isNewUser` check evaluates correctly.
      // Without this, every cloudchat-embedded login (new AND returning) is treated
      // as a new user, triggering the disposable-email blocklist GitHub fetch on
      // the auth hot path.
      createdAt: user.createdAt,
      cognitoClaims: {
        'custom:hub_role': payload['custom:hub_role'],
        'custom:eddie_workspaces': payload['custom:eddie_workspaces'],
      },
      cloudChatAuthorization: true,
      cognitoTokenExp: payload.exp,
    }
  } catch (error) {
    logger.error('Error in cloudchat-embedded authorize', { error })
    return null
  }
}
