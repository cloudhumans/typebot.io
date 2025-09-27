import { signIn } from 'next-auth/react'
import { getAllowedOrigins, isOriginAllowed } from './utils'

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

// Helper function to verify authentication via API call
const verifyAuthenticationStatus =
  async (): Promise<SessionResponse | null> => {
    try {
      // For iframe contexts, ensure we have storage access
      if ('hasStorageAccess' in document) {
        const hasAccess = await document.hasStorageAccess()
        if (!hasAccess) {
          console.warn('⚠️ No storage access - cookies may not work')
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
      console.error('Failed to verify authentication:', error)
      return null
    }
  }

// Helper function to handle authentication errors
const handleAuthError = (
  errorMessage: string,
  logMessage?: string,
  targetOrigin?: string
): false => {
  console.error(logMessage || errorMessage)

  // Use the specific origin if provided, otherwise try all allowed origins
  if (targetOrigin && isOriginAllowed(targetOrigin)) {
    window.parent.postMessage(
      {
        type: 'AUTH_ERROR',
        error: errorMessage,
      },
      targetOrigin
    )
  } else {
    // Fallback: try all allowed origins, but filter out wildcard patterns since postMessage doesn't support them
    const allowedOrigins = getAllowedOrigins()
    const nonWildcardOrigins = allowedOrigins.filter(
      (origin) => !origin.includes('*')
    )

    if (nonWildcardOrigins.length === 0) {
      console.error(
        '❌ No valid target origins for AUTH_ERROR (all contain wildcards)'
      )
      return false
    }

    nonWildcardOrigins.forEach((origin) => {
      window.parent.postMessage(
        {
          type: 'AUTH_ERROR',
          error: errorMessage,
        },
        origin
      )
    })
  }
  return false
}

export const handleEmbeddedAuthentication = async (): Promise<boolean> => {
  let parentOrigin: string | null = null

  try {
    console.log('🚀 Starting embedded authentication...')
    console.log('📍 Current window location:', window.location.href)
    console.log('📍 Parent window origin (referrer):', document.referrer)
    console.log('🔧 Allowed origins:', getAllowedOrigins())

    // Check if already authenticated via direct API call
    const session = await verifyAuthenticationStatus()

    if (session?.user) {
      console.log('✅ Already authenticated:', session.user)
      return true
    }

    console.log('❌ Not authenticated, requesting token from parent...')

    // Request token from parent - try to use referrer first, then fallback to allowed origins
    console.log('🔍 Requesting auth token from parent window...')

    // Try to get the parent origin from document.referrer first
    let targetOrigins: string[] = []

    if (document.referrer) {
      try {
        const referrerOrigin = new URL(document.referrer).origin
        if (isOriginAllowed(referrerOrigin)) {
          console.log(
            '✅ Using document.referrer as target origin:',
            referrerOrigin
          )
          targetOrigins = [referrerOrigin]
        } else {
          console.warn(
            '⚠️ Document referrer not in allowed origins:',
            referrerOrigin
          )
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse document.referrer:', document.referrer)
      }
    }

    // Fallback to allowed origins, but filter out wildcard patterns since postMessage doesn't support them
    if (targetOrigins.length === 0) {
      const allowedOrigins = getAllowedOrigins()
      targetOrigins = allowedOrigins.filter((origin) => !origin.includes('*'))
      console.log(
        '📡 Fallback: broadcasting to non-wildcard allowed origins:',
        targetOrigins
      )

      if (targetOrigins.length === 0) {
        console.error(
          '❌ No valid target origins found (all contain wildcards)'
        )
        return handleAuthError('No valid target origins for postMessage')
      }
    }

    targetOrigins.forEach((origin, index) => {
      console.log(
        `📤 Sending REQUEST_AUTH_TOKEN to origin ${index + 1}:`,
        origin
      )
      window.parent.postMessage({ type: 'REQUEST_AUTH_TOKEN' }, origin)
    })

    // Wait for token response
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('⏰ Auth token request timed out after 10 seconds')
        console.error('❓ Possible issues:')
        console.error('  1. Parent window not listening for REQUEST_AUTH_TOKEN')
        console.error('  2. Parent origin not in allowed origins list')
        console.error('  3. PostMessage blocked by browser policy')
        console.error('📋 Debug info:')
        console.error('  - Allowed origins:', getAllowedOrigins())
        console.error('  - Document referrer:', document.referrer)
        console.error('  - Window.parent exists:', !!window.parent)
        reject(new Error('Auth token request timeout'))
      }, 10000)

      const handleMessage = (event: MessageEvent) => {
        console.log('📥 Received message from origin:', event.origin)
        console.log('📥 Message type:', event.data?.type)
        console.log('📥 Full message data:', event.data)

        // Store the parent origin for later use
        if (isOriginAllowed(event.origin)) {
          parentOrigin = event.origin
          console.log('✅ Parent origin confirmed:', parentOrigin)
        }

        // Validate origin for security
        if (!isOriginAllowed(event.origin)) {
          console.warn(
            '❌ Ignored message from unauthorized origin:',
            event.origin
          )
          console.warn('   Allowed origins:', getAllowedOrigins())
          return
        }

        if (event.data.type === 'AUTH_TOKEN_RESPONSE') {
          console.log('✅ Received AUTH_TOKEN_RESPONSE')
          clearTimeout(timeout)
          window.removeEventListener('message', handleMessage)

          if (event.data.token) {
            console.log(
              '✅ Token received successfully (length:',
              event.data.token.length,
              ')'
            )
            resolve(event.data.token)
          } else {
            console.error('❌ No token in AUTH_TOKEN_RESPONSE')
            reject(new Error('No auth token received'))
          }
        } else {
          console.log('ℹ️ Ignoring message type:', event.data?.type)
        }
      }

      window.addEventListener('message', handleMessage)
      console.log('👂 Listening for AUTH_TOKEN_RESPONSE...')
    })

    console.log('🔐 Attempting to sign in with received token...')

    // Use NextAuth signIn with the CloudChat embedded provider
    const result = await signIn('cloudchat-embedded', {
      token,
      redirect: false,
    })

    console.log('📋 SignIn result:', result)

    if (result?.ok) {
      console.log('✅ NextAuth signIn successful, verifying session...')

      // Give NextAuth a moment to process the JWT and set cookies
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Verify session via direct API call
      const updatedSession = await verifyAuthenticationStatus()

      if (updatedSession?.user) {
        console.log('✅ Session verified successfully:', updatedSession.user)
        console.log(
          '🔐 User successfully authenticated via embedded Cognito token'
        )

        // Notify parent of success using the confirmed origin
        const targetOrigin = parentOrigin || getAllowedOrigins()[0]
        console.log('📤 Sending AUTH_SUCCESS to:', targetOrigin)

        window.parent.postMessage(
          {
            type: 'AUTH_SUCCESS',
            user: updatedSession.user,
          },
          targetOrigin
        )
        return true
      } else {
        console.error('❌ Session verification failed after successful signIn')
        return handleAuthError(
          'Session not available after authentication',
          'Authentication failed: session not available after sign-in',
          parentOrigin || undefined
        )
      }
    }

    console.error('❌ NextAuth signIn failed:', result?.error)
    return handleAuthError(
      result?.error || 'Authentication failed',
      `Authentication failed: ${result?.error}`,
      parentOrigin || undefined
    )
  } catch (error) {
    console.error('💥 Embedded authentication error:', error)
    return handleAuthError(
      error instanceof Error ? error.message : 'Authentication error',
      `Embedded authentication error: ${error}`,
      parentOrigin || undefined
    )
  }
}
