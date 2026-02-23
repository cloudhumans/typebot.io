import { signIn } from 'next-auth/react'
import logger from '@/helpers/logger'

interface SessionResponse {
  user?: {
    id: string
    email: string
    name?: string
    image?: string
    [key: string]: unknown
  }
  expires?: string
}

const verifyAuthenticationStatus =
  async (): Promise<SessionResponse | null> => {
    try {
      if ('hasStorageAccess' in document) {
        const hasAccess = await document.hasStorageAccess()
        if (!hasAccess) {
          console.warn('No storage access - cookies may not work')
        }
      }

      const response = await fetch('/api/auth/session', {
        credentials: 'include',
      })

      if (response.ok) {
        const session = await response.json()
        return session?.user ? session : null
      }
      return null
    } catch (error) {
      logger.error('Failed to verify authentication', { error })
      return null
    }
  }

export const handleEmbeddedAuthentication = async (
  token: string
): Promise<boolean> => {
  try {
    const session = await verifyAuthenticationStatus()
    if (session?.user) {
      logger.info('Already authenticated', { userId: session.user.id })
      return true
    }

    const result = await signIn('cloudchat-embedded', {
      token,
      redirect: false,
    })

    if (!result?.ok) {
      logger.error('SignIn failed', { error: result?.error })
      return false
    }

    return true
  } catch (error) {
    logger.error('Embedded authentication error', { error })
    return false
  }
}
