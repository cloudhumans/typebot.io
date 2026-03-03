import { signIn, signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import { trpcVanilla } from '@/lib/trpc'

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
      return false
    }

    return true
  } catch (error) {
    return false
  }
}
