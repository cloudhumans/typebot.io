import { PrismaClient, User } from '@typebot.io/prisma'
import { JWTPayload } from 'jose'
import logger from '@/helpers/logger'
import { CognitoJWTPayload } from '@/features/auth/types/cognito'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'
import { isPrismaUniqueViolation } from './isPrismaUniqueViolation'

export const findOrCreateCloudChatEmbeddedUser = async (
  p: PrismaClient,
  payload: JWTPayload & CognitoJWTPayload
): Promise<User | null> => {
  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    logger.warn('cloudchat-embedded payload missing email', {
      sub: payload.sub,
      cognitoUsername: payload['cognito:username'],
    })
    return null
  }

  const existing = await p.user.findUnique({
    where: { email: payload.email },
  })
  if (existing) return existing

  try {
    const user = await createCloudChatEmbeddedUser({
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
    return user
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      const raced = await p.user.findUnique({
        where: { email: payload.email },
      })
      if (raced) {
        logger.info('cloudchat-embedded JIT race resolved', {
          email: payload.email,
        })
        return raced
      }
      throw err
    }
    logger.warn('cloudchat-embedded JIT refused', {
      email: payload.email,
      reason: err instanceof Error ? err.message : 'unknown',
    })
    return null
  }
}
