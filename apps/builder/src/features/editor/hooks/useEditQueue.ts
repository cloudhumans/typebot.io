import { ValidationError } from '../../typebot/constants/errorTypes'
import { useState, useCallback, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { useToast } from '@/hooks/useToast'

export type { ValidationError }

export interface TypebotEditQueueItem {
  id: string
  userId: string
  typebotId: string
  joinedAt: Date
  lastActivityAt: Date // Usando updatedAt ao invés de lastActivityAt para compatibilidade com o Prisma
}

export const useEditQueue = (typebotId?: string) => {
  const [queueItems, setQueueItems] = useState<TypebotEditQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [joinQueuePending, setJoinQueuePending] = useState(false)
  const { showToast } = useToast()

  const utils = trpc.useContext()

  // Busca os itens da fila para um typebot específico
  const getQueueItems = trpc.typebotEditQueue.listByTypebotId.useQuery(
    { typebotId: typebotId ?? '' },
    {
      enabled: Boolean(typebotId),
      onSuccess: (data) => {
        setQueueItems(data)
      },
      onError: (error) => {
        console.error('Erro ao buscar fila de edição:', error)
      },
    }
  )

  // Busca o primeiro usuário na fila
  const getFirstInQueueQuery = trpc.typebotEditQueue.getFirstInQueue.useQuery(
    { typebotId: typebotId ?? '' },
    {
      enabled: Boolean(typebotId),
      onError: (error) => {
        console.error('Erro ao buscar primeiro usuário na fila:', error)
      },
    }
  )

  // Adiciona o usuário atual à fila de edição
  const joinQueueMutation = trpc.typebotEditQueue.join.useMutation({
    onSuccess: () => {
      if (typebotId) {
        utils.typebotEditQueue.listByTypebotId.invalidate({ typebotId })
      }
      setJoinQueuePending(false)
    },
    onError: (error) => {
      setJoinQueuePending(false)
      showToast({
        title: 'Erro ao entrar na fila de edição',
        description: error.message,
        status: 'error',
      })
    },
  })

  // Remove o usuário atual da fila de edição
  const leaveQueueMutation = trpc.typebotEditQueue.leave.useMutation({
    onSuccess: () => {
      if (typebotId) {
        utils.typebotEditQueue.listByTypebotId.invalidate({ typebotId })
      }
    },
    onError: (error) => {
      showToast({
        title: 'Erro ao sair da fila de edição',
        description: error.message,
        status: 'error',
      })
    },
  })

  // Atualiza o timestamp de última atividade
  const updateActivityMutation =
    trpc.typebotEditQueue.updateActivity.useMutation({
      onError: (error) => {
        console.error('Erro ao atualizar atividade:', error)
      },
    })

  // Limpa usuários inativos
  const cleanupInactiveUsersMutation =
    trpc.typebotEditQueue.cleanupInactiveUsers.useMutation({
      onSuccess: (data) => {
        if (typebotId && data.removedCount > 0) {
          utils.typebotEditQueue.listByTypebotId.invalidate({ typebotId })
        }
      },
      onError: (error) => {
        console.error('Erro ao limpar usuários inativos:', error)
      },
    })

  // Verificar se o usuário atual está na fila
  const isInQueue = useCallback(
    (userId: string): boolean => {
      if (!queueItems || queueItems.length === 0) return false
      return queueItems.some((item) => item.userId === userId)
    },
    [queueItems]
  )

  // Métodos expostos pelo hook
  const joinQueue = useCallback(
    async (userId: string) => {
      if (!typebotId || joinQueuePending) return false
      if (isInQueue(userId)) return true

      setJoinQueuePending(true)
      setIsLoading(true)

      try {
        await joinQueueMutation.mutateAsync({ typebotId })
        return true
      } catch (error) {
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [joinQueueMutation, typebotId, isInQueue, joinQueuePending]
  )

  const leaveQueue = useCallback(async () => {
    if (!typebotId) return false

    setIsLoading(true)
    try {
      await leaveQueueMutation.mutateAsync({ typebotId })
      return true
    } catch (error) {
      return false
    } finally {
      setIsLoading(false)
    }
  }, [leaveQueueMutation, typebotId])

  const updateActivity = useCallback(async () => {
    if (!typebotId) return false

    try {
      await updateActivityMutation.mutateAsync({ typebotId })
      return true
    } catch (error) {
      return false
    }
  }, [updateActivityMutation, typebotId])

  const cleanupInactiveUsers = useCallback(
    async (inactivityThresholdMinutes = 10) => {
      if (!typebotId) return false

      try {
        await cleanupInactiveUsersMutation.mutateAsync({
          typebotId,
          inactivityThresholdMinutes,
        })
        return true
      } catch (error) {
        return false
      }
    },
    [cleanupInactiveUsersMutation, typebotId]
  )

  // Verificar se o usuário atual é o primeiro na fila
  const isFirstInQueue = useCallback(
    (userId: string): boolean => {
      if (!queueItems || queueItems.length === 0) return false
      return queueItems[0].userId === userId
    },
    [queueItems]
  )

  // Verificar a posição do usuário na fila baseado na data de entrada (joinedAt)
  const getPositionInQueue = useCallback(
    (userId: string): number | null => {
      if (!queueItems || queueItems.length === 0) return null

      // Ordenar a fila baseado no joinedAt (mais antigo primeiro)
      const sortedQueue = [...queueItems].sort(
        (a, b) =>
          new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
      )

      // Encontrar a posição do usuário na fila ordenada
      const userIndex = sortedQueue.findIndex((item) => item.userId === userId)
      return userIndex !== -1 ? userIndex + 1 : null
    },
    [queueItems]
  )

  // Método que retorna o primeiro usuário na fila
  const getFirstInQueue = useCallback(() => {
    return getFirstInQueueQuery.data || null
  }, [getFirstInQueueQuery.data])

  // Configuração de heartbeat para manter a atividade do usuário
  useEffect(() => {
    if (!typebotId) return

    // Envia heartbeat a cada 5 segundos
    const heartbeatInterval = setInterval(() => {
      updateActivity().catch(console.error)
    }, 5000)

    // Limpa usuários inativos a cada 2 minutos
    const cleanupInterval = setInterval(() => {
      cleanupInactiveUsers(10).catch(console.error)
    }, 120000)

    return () => {
      clearInterval(heartbeatInterval)
      clearInterval(cleanupInterval)
    }
  }, [typebotId, cleanupInactiveUsers, updateActivity])

  return {
    queueItems,
    isLoading,
    refreshQueue: getQueueItems.refetch,
    joinQueue,
    leaveQueue,
    updateActivity,
    cleanupInactiveUsers,
    isFirstInQueue,
    isInQueue,
    getPositionInQueue,
    getFirstInQueue,
  }
}
