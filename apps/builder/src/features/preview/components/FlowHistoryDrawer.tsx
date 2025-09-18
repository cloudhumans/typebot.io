import { CopyIcon, HistoryIcon } from '@/components/icons'
import { TimeSince } from '@/components/TimeSince'
import { ConfirmModal } from '@/components/ConfirmModal'
import {
  Avatar,
  CloseButton,
  Fade,
  Flex,
  Heading,
  HStack,
  IconButton,
  Spinner,
  Stack,
  Tag,
  Text,
  Tooltip,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react'
import { useDrag } from '@use-gesture/react'
import { useCallback, useEffect, useState } from 'react'
import { headerHeight } from '../../editor/constants'
import { useTypebot } from '../../editor/providers/TypebotProvider'

import {
  parseTypebotHistory,
  TypebotHistory,
} from '@typebot.io/schemas/features/typebot/typebotHistory'

import { ResizeHandle } from './ResizeHandle'

import { useToast } from '@/hooks/useToast'
import { trpc } from '@/lib/trpc'
import { useTranslate } from '@tolgee/react'
import { TypebotHistoryOrigin } from '@typebot.io/prisma'

type Props = {
  onClose: () => void
}

export const FlowHistoryDrawer = ({ onClose }: Props) => {
  const { t } = useTranslate()
  const { showToast } = useToast()

  const { typebot, getTypebotHistory, rollbackTypebot } = useTypebot()

  const getBadgeColorScheme = (origin: TypebotHistoryOrigin) => {
    switch (origin.toLowerCase()) {
      case 'publish':
        return 'green'
      case 'restore':
        return 'blue'
      default:
        return 'gray'
    }
  }

  const getOriginLabel = (origin: string) => {
    return t(`preview.flowHistory.origin.${origin.toLowerCase()}`, {
      defaultValue: origin,
    })
  }

  const countBlocks = (groups: unknown[] | null): number => {
    if (!groups) return 0
    return groups.reduce((total: number, group) => {
      return (
        total +
        (group &&
        typeof group === 'object' &&
        'blocks' in group &&
        Array.isArray(group.blocks)
          ? group.blocks.length
          : 0)
      )
    }, 0)
  }

  const [width, setWidth] = useState(500)
  const [isResizeHandleVisible, setIsResizeHandleVisible] = useState(false)
  const [, setIsRollingBack] = useState(false)
  const [rollingBackItemId, setRollingBackItemId] = useState<string | null>(
    null
  )
  const [snapshotToRestore, setSnapshotToRestore] =
    useState<TypebotHistory | null>(null)
  const {
    isOpen: isRestoreConfirmOpen,
    onOpen: onRestoreConfirmOpen,
    onClose: onRestoreConfirmClose,
  } = useDisclosure()

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
    history: TypebotHistory[]
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

  const handleRollback = async (snapshot: TypebotHistory) => {
    if (!snapshot || rollingBackItemId) return

    try {
      setIsRollingBack(true)
      setRollingBackItemId(snapshot.id)

      await rollbackTypebot(snapshot.id)

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

  const handleRestoreClick = (snapshot: TypebotHistory) => {
    setSnapshotToRestore(snapshot)
    onRestoreConfirmOpen()
  }

  const handleConfirmRestore = async () => {
    if (!snapshotToRestore) return
    onRestoreConfirmClose()
    await handleRollback(snapshotToRestore)
    setSnapshotToRestore(null)
  }

  const handleDuplicate = async (snapshot: TypebotHistory) => {
    console.log('Duplicating snapshot:', snapshot)
    if (!typebot || !snapshot || !snapshot.content) return

    try {
      const history = parseTypebotHistory(snapshot.content)

      duplicateTypebot({
        typebot: {
          ...history,
          name: `${typebot.name} ${t('editor.header.user.duplicateSuffix')}`,
        },
        workspaceId: typebot.workspaceId,
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
                  <HStack justifyContent="space-between" mb={2}>
                    <Text fontWeight="medium">
                      <TimeSince date={item.createdAt.toISOString()} />
                    </Text>
                    <Text fontSize="xs">
                      <Tag
                        rounded="full"
                        colorScheme={getBadgeColorScheme(item.origin)}
                        size="sm"
                      >
                        {getOriginLabel(item.origin)}
                      </Tag>
                    </Text>
                  </HStack>

                  {item.content && (
                    <HStack spacing={3} wrap="wrap" fontSize={'sm'} mb={4}>
                      {item.content.groups && (
                        <HStack spacing={1}>
                          <Text fontWeight="medium" color="blue.400">
                            {item.content.groups.length}
                          </Text>
                          <Text color="gray.400">
                            {t('preview.flowHistory.snapshotDetails.groups', {
                              count: item.content.groups.length,
                            })}
                          </Text>
                        </HStack>
                      )}

                      {item.content.groups && (
                        <HStack spacing={1}>
                          <Text fontWeight="medium" color="green.500">
                            {countBlocks(item.content.groups)}
                          </Text>
                          <Text color="gray.400">
                            {t('preview.flowHistory.snapshotDetails.blocks', {
                              count: countBlocks(item.content.groups),
                            })}
                          </Text>
                        </HStack>
                      )}

                      {item.content.variables && (
                        <HStack spacing={1}>
                          <Text fontWeight="medium" color="orange.500">
                            {item.content.variables.length}
                          </Text>
                          <Text color="gray.400">
                            {t(
                              'preview.flowHistory.snapshotDetails.variables',
                              {
                                count: item.content.variables.length,
                              }
                            )}
                          </Text>
                        </HStack>
                      )}

                      {item.content.edges && (
                        <HStack spacing={1}>
                          <Text fontWeight="medium" color="purple.500">
                            {item.content.edges.length}
                          </Text>
                          <Text color="gray.400">
                            {t(
                              'preview.flowHistory.snapshotDetails.connections',
                              {
                                count: item.content.edges.length,
                              }
                            )}
                          </Text>
                        </HStack>
                      )}
                      {item.isRestored && (
                        <Text fontSize="xs" color="blue.500">
                          • {t('preview.flowHistory.item.restored')} a partir de{' '}
                          {item.restoredFromId}
                        </Text>
                      )}
                    </HStack>
                  )}
                  <HStack justifyContent="space-between" spacing={2}>
                    <HStack>
                      <Avatar
                        name={item.author.name ?? undefined}
                        src={item.author.image ?? undefined}
                        boxSize="20px"
                      />
                      <Text fontSize="xs">
                        {item.author.name ||
                          t('preview.flowHistory.item.unknownUser')}
                      </Text>
                    </HStack>
                    <HStack>
                      <Tooltip
                        label={t('preview.flowHistory.actions.restore')}
                        placement="bottom"
                      >
                        <IconButton
                          aria-label={t('preview.flowHistory.actions.restore')}
                          icon={<HistoryIcon />}
                          size="sm"
                          colorScheme="gray"
                          variant="outline"
                          onClick={() => handleRestoreClick(item)}
                          isLoading={rollingBackItemId === item.id}
                        />
                      </Tooltip>
                      <Tooltip
                        label={t('preview.flowHistory.actions.duplicate')}
                        placement="bottom"
                      >
                        <IconButton
                          aria-label={t(
                            'preview.flowHistory.actions.duplicate'
                          )}
                          icon={<CopyIcon />}
                          size="sm"
                          colorScheme="gray"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const result = await getTypebotHistory({
                                historyId: item.id,
                                excludeContent: false,
                              })
                              console.log(
                                'Fetched snapshot for duplication:',
                                result
                              )
                              if (result.history.length > 0) {
                                console.log(
                                  'Setting selected snapshot:',
                                  result.history[0]
                                )
                                await handleDuplicate(result.history[0])
                              }
                            } catch (error) {
                              console.error(
                                'Failed to get snapshot details for duplication:',
                                error
                              )
                            }
                          }}
                        />
                      </Tooltip>
                    </HStack>
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

        <ConfirmModal
          isOpen={isRestoreConfirmOpen}
          onClose={onRestoreConfirmClose}
          onConfirm={handleConfirmRestore}
          title={t('preview.flowHistory.confirm.restoreTitle')}
          message={
            <Text>{t('preview.flowHistory.confirm.restoreMessage')}</Text>
          }
          confirmButtonLabel={t('preview.flowHistory.confirm.restoreButton')}
          confirmButtonColor="blue"
        />
      </Flex>
    </Flex>
  )
}
