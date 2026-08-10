import { signIn, signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import { trpcVanilla } from '@/lib/trpc'
import logger from '@/helpers/logger'

// next-auth/react defaults `callbackUrl` to `window.location.href` when not
// passed explicitly. For the cloudchat-embedded flow that URL carries the
// ~2 KB Cognito JWT in its query string, which next-auth then persists in the
// `__Secure-next-auth.callback-url` cookie. Combined with the session-token
// cookie, response Set-Cookie headers exceed Kong's default
// `proxy_buffer_size` (4 KB), and the gateway rejects the response with
// "an invalid response was received from the upstream server" → 502.
//
// callbackUrl is only used for post-signin redirects; the embedded flow uses
// `redirect: false` and ignores `result.url`, so passing a short origin+path
// is functionally equivalent and keeps response headers small.
export const buildEmbeddedCallbackUrl = (
  location: Pick<Location, 'origin' | 'pathname'>
): string => `${location.origin}${location.pathname}`

export const handleEmbeddedAuthentication = async ({
  session,
  token,
  callbackUrl,
}: {
  token: string
  session: Session | null
  callbackUrl: string
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
      callbackUrl,
    })

    if (!result?.ok) {
      logger.error('Embedded authentication failed', { result })
      return false
    }

    return true
  } catch (error) {
    logger.error('Error during embedded authentication', {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              cause: error.cause,
            }
          : String(error),
    })
    return false
  }
}
