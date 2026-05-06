import { PrismaClient } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'
import logger from '@/helpers/logger'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { DatabaseUserWithCognito } from '@/features/auth/types/cognito'
import { isPrismaUniqueViolation } from './isPrismaUniqueViolation'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'

type Credentials = { token?: string } | undefined

type AuthorizedUser = Pick<
  DatabaseUserWithCognito,
  | 'id'
  | 'name'
  | 'email'
  | 'image'
  | 'emailVerified'
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

    if (typeof payload.email !== 'string' || payload.email.length === 0) {
      logger.warn('cloudchat-embedded payload missing email', {
        sub: payload.sub,
        cognitoUsername: payload['cognito:username'],
      })
      return null
    }

    let user = await p.user.findUnique({
      where: { email: payload.email },
    })

    if (!user) {
      try {
        user = await createCloudChatEmbeddedUser({
          p,
          email: payload.email,
          name: payload.name ?? null,
          emailVerified: payload.email_verified === true ? new Date() : null,
        })
        logger.info('JIT-provisioned cloudchat-embedded user', {
          userId: user.id,
          email: user.email,
          hubRole: payload['custom:hub_role'],
          eddieWorkspacesCount: (payload['custom:eddie_workspaces'] ?? '')
            .split(',')
            .filter(Boolean).length,
        })
      } catch (err) {
        if (isPrismaUniqueViolation(err)) {
          user = await p.user.findUnique({
            where: { email: payload.email },
          })
          if (!user) throw err
          logger.info('cloudchat-embedded JIT race resolved', {
            email: payload.email,
          })
        } else {
          logger.warn('cloudchat-embedded JIT refused', {
            email: payload.email,
            reason: err instanceof Error ? err.message : 'unknown',
          })
          return null
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
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
