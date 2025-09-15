import { Badge, HStack, Text, Tooltip, VStack } from '@chakra-ui/react'
import { UsersIcon } from '@/components/icons'
import { trpc } from '@/lib/trpc'
import { useTypebot } from '../providers/TypebotProvider'
import { useState } from 'react'
import { useUser } from '@/features/account/hooks/useUser'

export const OnlineUsersIndicator = () => {
  const { typebot } = useTypebot()
  const { user: currentUser } = useUser()
  const [onlineData, setOnlineData] = useState<{
    count: number
    users: Array<{ id: string; name?: string; email?: string }>
  } | null>(null)

  trpc.onlineUsers.subscribe.useSubscription(
    {
      typebotId: typebot?.id ?? '',
      user: {
        id: currentUser?.id ?? '',
        name: currentUser?.name ?? undefined,
        email: currentUser?.email ?? undefined,
      },
    },
    {
      enabled: !!typebot?.id,
      onData: (data) => {
        setOnlineData(data)
      },
      onError: (error) => {
        console.error('Error in online users subscription:', error)
      },
    }
  )

  if (!typebot?.id || !onlineData || onlineData.count <= 1) {
    return null
  }

  const otherUsers = onlineData.users?.filter(
    (user) => user.id !== currentUser?.id
  )
  const otherUsersCount = otherUsers?.length

  if (!otherUsersCount || otherUsersCount === 0) {
    return null
  }

  const getUserDisplayName = (user: { name?: string; email?: string }) => {
    return user.name || user.email || 'Anonymous'
  }

  return (
    <Tooltip
      label={
        <VStack align="start" spacing={1}>
          <Text fontSize="sm" fontWeight="semibold">
            {otherUsersCount === 1
              ? 'Pessoa visualizando'
              : 'Pessoas visualizando'}{' '}
            este fluxo:
          </Text>
          {otherUsers.map((user) => (
            <Text key={user.id} fontSize="xs" color="gray.300">
              • {getUserDisplayName(user)}
            </Text>
          ))}
        </VStack>
      }
      hasArrow
      placement="bottom-start"
    >
      <HStack spacing={1}>
        <UsersIcon color="green.500" boxSize={4} />
        <Badge
          colorScheme="green"
          variant="subtle"
          size="sm"
          borderRadius="full"
        >
          <Text fontSize="xs" fontWeight="semibold">
            {otherUsersCount}
          </Text>
        </Badge>
      </HStack>
    </Tooltip>
  )
}
