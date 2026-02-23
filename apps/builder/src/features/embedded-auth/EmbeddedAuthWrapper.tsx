import React, { useEffect, useRef, useState, PropsWithChildren } from 'react'
import { useSession } from 'next-auth/react'
import { Flex, Spinner, Text } from '@chakra-ui/react'
import { handleEmbeddedAuthentication } from './embedded-auth'

import { useSearchParams } from 'next/navigation'

export const EmbeddedAuthWrapper = ({ children }: PropsWithChildren) => {
  const { data: session, status } = useSession()

  const searchParams = useSearchParams()
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const authAttempted = useRef(false)

  const isEmbedded = searchParams?.get('embedded')
  const embeddedJwt = searchParams?.get('jwt')

  useEffect(() => {
    if (!searchParams || isAuthReady) return

    if (!isEmbedded || !embeddedJwt) {
      setIsAuthReady(true)
      return
    }

    if (status !== 'loading') {
      if (session) {
        setIsAuthReady(true)
        return
      }

      if (authAttempted.current) return
      authAttempted.current = true

      handleEmbeddedAuthentication(embeddedJwt)
        .then((success) => {
          if (!success)
            return setAuthError(
              'Failed to load flow builder. Please reload the page.'
            )

          setIsAuthReady(true)
        })
        .catch(() => {
          setAuthError('An unexpected error occurred.')
        })
    }
  }, [searchParams, session, status, isAuthReady, embeddedJwt, isEmbedded])

  if (authError) {
    return (
      <Flex
        h="100vh"
        justify="center"
        align="center"
        flexDirection="column"
        gap={4}
      >
        <Text color="red.500">{authError}</Text>
      </Flex>
    )
  }

  if (!searchParams || !isAuthReady) {
    return (
      <Flex
        h="100vh"
        justify="center"
        align="center"
        flexDirection="column"
        gap={4}
      >
        <Spinner size="lg" />
        <Text>
          {status === 'loading'
            ? 'Initializing...'
            : 'Authenticating with CloudChat...'}
        </Text>
      </Flex>
    )
  }

  // Auth ready or non-embedded, render children
  return <>{children}</>
}
