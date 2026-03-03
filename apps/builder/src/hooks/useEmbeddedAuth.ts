import { handleEmbeddedAuthentication } from '@/features/embedded-auth'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export const useEmbeddedAuth = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const { data: sessionData, status: sessionStatus } = useSession()

  const searchParams = useSearchParams()
  const authAttempted = useRef(false)

  const isEmbedded = searchParams?.get('embedded') === 'true'
  const embeddedJwt = searchParams?.get('jwt')

  useEffect(() => {
    // searchParams is not available on first render
    if (authAttempted.current || !searchParams || sessionStatus === 'loading')
      return

    if (!isEmbedded || !embeddedJwt) return setIsLoading(false)

    // only attempt auth once
    authAttempted.current = true

    handleEmbeddedAuthentication({ session: sessionData, token: embeddedJwt })
      .then((success) => {
        if (!success)
          setAuthError('Failed to load flow builder. Please reload the page.')
      })
      .catch(() => {
        setAuthError('An unexpected error occurred. Please reload the page.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [searchParams, sessionData, sessionStatus, embeddedJwt, isEmbedded])

  return { isLoading, authError }
}
