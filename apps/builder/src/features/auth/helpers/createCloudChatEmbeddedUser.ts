import { PrismaClient, User } from '@typebot.io/prisma'
import { trackEvents } from '@typebot.io/telemetry/trackEvents'

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

  await trackEvents([
    {
      name: 'User created',
      userId: user.id,
      data: { email, name: name?.split(' ')[0] },
    },
  ])

  return user
}
