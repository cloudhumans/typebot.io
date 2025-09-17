import { CopyIcon, HistoryIcon } from '@/components/icons'
import {
  CloseButton,
  Fade,
  Flex,
  Heading,
  HStack,
  IconButton,
  Spinner,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { useDrag } from '@use-gesture/react'
import { useCallback, useEffect, useState } from 'react'
import { headerHeight } from '../../editor/constants'
import { useTypebot } from '../../editor/providers/TypebotProvider'
import { ResizeHandle } from './ResizeHandle'

import { useToast } from '@/hooks/useToast'
import { trpc } from '@/lib/trpc'
import { useTranslate } from '@tolgee/react'
import { TypebotHistoryOrigin } from '@typebot.io/prisma'

type Props = {
  onClose: () => void
}

import {
  Edge,
  GroupV6,
  settingsSchema,
  startEventSchema,
  Theme,
  Variable,
} from '@typebot.io/schemas'
import { z } from 'zod'

interface TypebotHistoryContent {
  name: string
  icon: string | null
  groups: GroupV6[] | null
  events: z.infer<typeof startEventSchema>[] | null
  variables: Variable[] | null
  edges: Edge[] | null
  theme: Theme | null
  settings: z.infer<typeof settingsSchema> | null
}

interface TypebotHistoryItem {
  id: string
  createdAt: Date
  authorName: string | null
  version: string
  origin: TypebotHistoryOrigin
  restoredFromId: string | null
  publishedAt: Date | null
  isRestored: boolean
  content?: TypebotHistoryContent
}

export const FlowHistoryDrawer = ({ onClose }: Props) => {
  const { t } = useTranslate()
  const { showToast } = useToast()

  const { typebot, getTypebotHistory, rollbackTypebot } = useTypebot()
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<TypebotHistoryItem | null>(null)

  const [width, setWidth] = useState(500)
  const [isResizeHandleVisible, setIsResizeHandleVisible] = useState(false)
  const [, setIsRollingBack] = useState(false)
  const [rollingBackItemId, setRollingBackItemId] = useState<string | null>(
    null
  )

  const { mutate: duplicateTypebot } = trpc.typebot.importTypebot.useMutation({
    onSuccess: (data) => {
      window.location.href = `/typebots/${data.typebot.id}/edit`
    },
  })

  const useResizeHandleDrag = useDrag(
    (state) => {
      setWidth(-state.offset[0])
    },
    {
      from: () => [-width, 0],
    }
  )

  const [historyData, setHistoryData] = useState<{
    history: TypebotHistoryItem[]
    nextCursor: string | null
  }>({ history: [], nextCursor: null })
  const [isLoading, setIsLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await getTypebotHistory({ limit: 20 })
      setHistoryData(result)
    } catch (error) {
      console.error('Failed to fetch typebot history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [getTypebotHistory])

  const handleRollback = async () => {
    if (!selectedSnapshot || rollingBackItemId) return

    try {
      setIsRollingBack(true)
      setRollingBackItemId(selectedSnapshot.id)

      await rollbackTypebot(selectedSnapshot.id)

      showToast({
        title: t('preview.flowHistory.toast.rollbackComplete'),
        description: t('preview.flowHistory.toast.flowRestored'),
        status: 'success',
      })

      await fetchHistory()
    } catch (error) {
      console.error('Failed to rollback:', error)
      showToast({
        title: t('preview.flowHistory.toast.rollbackFailed'),
        description:
          error instanceof Error
            ? error.message
            : t('preview.flowHistory.toast.unknownError'),
        status: 'error',
      })
    } finally {
      setIsRollingBack(false)
      setRollingBackItemId(null)
    }
  }

  const handleDuplicate = async () => {
    if (!typebot || !selectedSnapshot || !selectedSnapshot.content) return

    try {
      duplicateTypebot({
        typebot: {
          //ta errado tem que ser o do snapshot
          ...typebot,
          name: `${selectedSnapshot.content.name} (cópia)`,
        },
        workspaceId: typebot.workspaceId,
        // duplicateName: `${selectedSnapshot.content.name} (cópia)`,
        // customTypebot: selectedSnapshot.content,
      })
    } catch (error) {
      console.error('Failed to duplicate:', error)
      showToast({
        title: t('preview.flowHistory.toast.duplicateFailed'),
        description:
          error instanceof Error
            ? error.message
            : t('preview.flowHistory.toast.unknownError'),
        status: 'error',
      })
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <Flex
      pos="absolute"
      right="0"
      top={`0`}
      h={`100%`}
      bgColor={useColorModeValue('white', 'gray.900')}
      borderLeftWidth={'1px'}
      shadow="lg"
      borderLeftRadius={'lg'}
      onMouseOver={() => setIsResizeHandleVisible(true)}
      onMouseLeave={() => setIsResizeHandleVisible(false)}
      p="6"
      zIndex={10}
      style={{ width: `${width}px` }}
    >
      <Flex
        pos="absolute"
        right="0"
        top={`0`}
        h={`100%`}
        borderLeftWidth={'1px'}
        shadow="lg"
        borderLeftRadius={'lg'}
        onMouseOver={() => setIsResizeHandleVisible(true)}
        onMouseLeave={() => setIsResizeHandleVisible(false)}
        p="6"
        zIndex={10}
        style={{ width: `${width}px` }}
      >
        <Fade in={isResizeHandleVisible}>
          <ResizeHandle
            {...useResizeHandleDrag()}
            pos="absolute"
            left="-7.5px"
            top={`calc(50% - ${headerHeight}px)`}
          />
        </Fade>

        <Stack w="full" spacing="4">
          <CloseButton
            pos="absolute"
            right="1rem"
            top="1rem"
            onClick={onClose}
          />

          <HStack spacing={3} alignItems="center" paddingRight={6}>
            <Heading fontSize="md">{t('preview.flowHistory.title')}</Heading>

            {isLoading && (
              <HStack spacing={2}>
                <Spinner size="xs" />
                <Text fontSize="xs">{t('preview.flowHistory.loading')}</Text>
              </HStack>
            )}
          </HStack>

          {historyData.history.length === 0 && !isLoading ? (
            <Text>{t('preview.flowHistory.noHistoryFound')}</Text>
          ) : (
            <Stack
              spacing={2}
              overflowY="auto"
              maxH="calc(100vh - 150px)"
              pr={2}
            >
              {historyData.history.map((item) => (
                <Flex
                  key={item.id}
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  flexDir="column"
                >
                  <HStack justifyContent="space-between" mb={1}>
                    <Text fontWeight="medium">
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                    <Text fontSize="xs">
                      {t('preview.flowHistory.item.origin')}: {item.origin}
                    </Text>
                  </HStack>

                  {item.content && (
                    <Stack spacing={2}>
                      {item.content.groups && (
                        <Text fontSize="sm">
                          {item.content.groups.length}{' '}
                          {t('preview.flowHistory.snapshotDetails.groups')}
                        </Text>
                      )}
                    </Stack>
                  )}
                  <HStack>
                    <Text fontSize="xs">
                      {item.authorName ||
                        t('preview.flowHistory.item.unknownUser')}
                    </Text>
                    {item.publishedAt && (
                      <Text fontSize="xs" color="green.500">
                        • {t('preview.flowHistory.item.published')}
                      </Text>
                    )}
                    {item.isRestored && (
                      <Text fontSize="xs" color="blue.500">
                        • {t('preview.flowHistory.item.restored')}
                      </Text>
                    )}
                  </HStack>
                  <HStack mt={2} justifyContent="flex-end" spacing={2}>
                    <IconButton
                      aria-label={t('preview.flowHistory.actions.restore')}
                      icon={<HistoryIcon />}
                      size="xs"
                      colorScheme="blue"
                      variant="ghost"
                      onClick={async () => handleRollback()}
                      isLoading={rollingBackItemId === item.id}
                    />
                    <IconButton
                      aria-label={t('preview.flowHistory.actions.duplicate')}
                      icon={<CopyIcon />}
                      size="xs"
                      colorScheme="gray"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const result = await getTypebotHistory({
                            historyId: item.id,
                            excludeContent: false,
                          })
                          if (result.history.length > 0) {
                            setSelectedSnapshot(result.history[0])
                            handleDuplicate()
                          }
                        } catch (error) {
                          console.error(
                            'Failed to get snapshot details for duplication:',
                            error
                          )
                        }
                      }}
                    />
                  </HStack>
                </Flex>
              ))}
              {historyData.nextCursor && (
                <Flex justifyContent="center" py={2}>
                  <Text
                    fontSize="sm"
                    color="blue.500"
                    cursor="pointer"
                    onClick={async () => {
                      if (isLoading) return
                      setIsLoading(true)
                      try {
                        const nextPage = await getTypebotHistory({
                          limit: 20,
                          // cursor: historyData.nextCursor
                        })
                        setHistoryData({
                          history: [
                            ...historyData.history,
                            ...nextPage.history,
                          ],
                          nextCursor: nextPage.nextCursor,
                        })
                      } catch (error) {
                        console.error('Failed to fetch more history:', error)
                      } finally {
                        setIsLoading(false)
                      }
                    }}
                  >
                    {t('preview.flowHistory.actions.loadMore')}
                  </Text>
                </Flex>
              )}
            </Stack>
          )}
        </Stack>
      </Flex>
    </Flex>
  )
}
