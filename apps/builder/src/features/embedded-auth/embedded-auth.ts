import { signIn, signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import { trpcVanilla } from '@/lib/trpc'
import logger from '@/helpers/logger'

export const handleEmbeddedAuthentication = async ({
  session,
  token,
}: {
  token: string
  session: Session | null
}): Promise<boolean> => {
  try {
    if (session?.user) {
      const { email } = await trpcVanilla.verifyEmbeddedToken.mutate({ token })

      if (
        email === session.user.email &&
        'cloudChatAuthorization' in session.user &&
        session.user.cloudChatAuthorization === true
      )
        return true
      await signOut({ redirect: false })
    }
    const result = await signIn('cloudchat-embedded', {
      token,
      redirect: false,
    })

    if (!result?.ok) {
      logger.error('Embedded authentication failed', { result })
      return false
    }

    return true
  } catch (error) {
    logger.error('Error during embedded authentication', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
