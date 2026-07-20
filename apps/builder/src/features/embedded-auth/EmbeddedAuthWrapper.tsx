import { PropsWithChildren } from 'react'
import { Flex, Spinner, Text } from '@chakra-ui/react'
import { useEmbeddedAuth } from '@/hooks/useEmbeddedAuth'

export const EmbeddedAuthWrapper = ({ children }: PropsWithChildren) => {
  const { authError, isLoading } = useEmbeddedAuth()

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

  if (isLoading) {
    return (
      <Flex h="100vh" justify="center" align="center" flexDirection="column">
        <Spinner size="lg" />
      </Flex>
    )
  }

  // Auth ready or non-embedded, render children
  return <>{children}</>
}
