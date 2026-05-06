import { PrismaClient, User } from '@typebot.io/prisma'
import { trackEvents } from '@typebot.io/telemetry/trackEvents'
import logger from '@/helpers/logger'

type CreateCloudChatEmbeddedUserInput = {
  p: PrismaClient
  email: string
  name?: string | null
  emailVerified?: Date | null
  image?: string | null
}

export const createCloudChatEmbeddedUser = async ({
  p,
  email,
  name,
  emailVerified,
  image,
}: CreateCloudChatEmbeddedUserInput): Promise<User> => {
  const user = await p.user.create({
    data: {
      email,
      name: name ?? undefined,
      emailVerified: emailVerified ?? undefined,
      image: image ?? undefined,
      onboardingCategories: [],
    },
  })

  // Telemetry is best-effort. The user row is the load-bearing side effect;
  // a telemetry outage must not block the auth path or surface as a JIT refusal.
  try {
    await trackEvents([
      {
        name: 'User created',
        userId: user.id,
        data: { email, name: name?.split(' ')[0] },
      },
    ])
  } catch (telemetryError) {
    logger.warn('cloudchat-embedded telemetry failed (user provisioned)', {
      userId: user.id,
      email: user.email,
      error:
        telemetryError instanceof Error ? telemetryError.message : 'unknown',
    })
  }

  return user
}
