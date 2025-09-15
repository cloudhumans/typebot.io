import { EditableEmojiOrImageIcon } from '@/components/EditableEmojiOrImageIcon'
import {
  ChevronLeftIcon,
  CopyIcon,
  PlayIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons'
import { SupportBubble } from '@/components/SupportBubble'
import { PublishButton } from '@/features/publish/components/PublishButton'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { trpc } from '@/lib/trpc'
import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Spinner,
  StackProps,
  Text,
  Tooltip,
  chakra,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react'
import { useTranslate } from '@tolgee/react'
import { isDefined, isNotDefined } from '@typebot.io/lib'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { headerHeight } from '../constants'
import { RightPanel, useEditor } from '../providers/EditorProvider'
import { useTypebot } from '../providers/TypebotProvider'
import { EditableTypebotName } from './EditableTypebotName'
import { GuestTypebotHeader } from './UnauthenticatedTypebotHeader'

export const TypebotHeader = () => {
  const {
    typebot,
    publishedTypebot,
    currentUserMode,
    isReadOnlyDueToEditing,
    queuePosition,
    editingQueue,
  } = useTypebot()
  const { data: queueData } = trpc.typebot.getEditingQueue.useQuery(
    { typebotId: typebot?.id as string },
    { enabled: Boolean(typebot?.id) }
  )

  console.log('queueData', queueData)
  // user 1 ta editando, fila => user2 e user3

  const { isOpen } = useDisclosure()
  const headerBgColor = useColorModeValue('white', 'gray.900')

  if (currentUserMode === 'guest') return <GuestTypebotHeader />
  return (
    <Flex
      w="full"
      borderBottomWidth="1px"
      justify="center"
      align="center"
      h={`${headerHeight}px`}
      zIndex={100}
      pos="relative"
      bgColor={headerBgColor}
      flexShrink={0}
    >
      {isOpen && <SupportBubble autoShowDelay={0} />}
      <LeftElements pos="absolute" left="1rem" />

      {isReadOnlyDueToEditing && (
        <EditingIndicator
          queuePosition={queuePosition}
          editingQueue={editingQueue}
          editingUserEmail={'editingUserEmail'}
          editingUserName={'editingUserName'}
        />
      )}
      <TypebotNav
        display={{ base: 'none', xl: 'flex' }}
        pos={{ base: 'absolute' }}
        typebotId={typebot?.id}
        isResultsDisplayed={isDefined(publishedTypebot)}
      />
      <RightElements
        right="40px"
        pos="absolute"
        display={['none', 'flex']}
        isResultsDisplayed={isDefined(publishedTypebot)}
      />
    </Flex>
  )
}

const LeftElements = ({ ...props }: StackProps) => {
  const { t } = useTranslate()
  const router = useRouter()
  const {
    typebot,
    updateTypebot,
    canUndo,
    canRedo,
    undo,
    redo,
    currentUserMode,
    isSavingLoading,
    releaseEditing,
  } = useTypebot()

  const [isRedoShortcutTooltipOpen, setRedoShortcutTooltipOpen] =
    useState(false)

  const [isUndoShortcutTooltipOpen, setUndoShortcutTooltipOpen] =
    useState(false)

  const hideUndoShortcutTooltipLater = useDebouncedCallback(() => {
    setUndoShortcutTooltipOpen(false)
  }, 1000)

  const hideRedoShortcutTooltipLater = useDebouncedCallback(() => {
    setRedoShortcutTooltipOpen(false)
  }, 1000)

  const handleNameSubmit = (name: string) =>
    updateTypebot({ updates: { name } })

  const handleChangeIcon = (icon: string) =>
    updateTypebot({ updates: { icon } })

  useKeyboardShortcuts({
    undo: () => {
      if (!canUndo) return
      hideUndoShortcutTooltipLater.flush()
      setUndoShortcutTooltipOpen(true)
      hideUndoShortcutTooltipLater()
      undo()
    },
    redo: () => {
      if (!canRedo) return
      hideUndoShortcutTooltipLater.flush()
      setRedoShortcutTooltipOpen(true)
      hideRedoShortcutTooltipLater()
      redo()
    },
  })

  return (
    <HStack justify="center" align="center" spacing="6" {...props}>
      <HStack alignItems="center" spacing={3}>
        {router.query.embedded !== 'true' && (
          <IconButton
            as={Link}
            aria-label="Navigate back"
            icon={<ChevronLeftIcon fontSize={25} />}
            href={{
              pathname: router.query.parentId
                ? '/typebots/[typebotId]/edit'
                : typebot?.folderId
                ? '/typebots/folders/[id]'
                : '/typebots',
              query: {
                id: typebot?.folderId ?? [],
                parentId: Array.isArray(router.query.parentId)
                  ? router.query.parentId.slice(0, -1)
                  : [],
                typebotId: Array.isArray(router.query.parentId)
                  ? [...router.query.parentId].pop()
                  : router.query.parentId ?? [],
              },
            }}
            onClick={async () =>
              typebot?.id && (await releaseEditing({ typebotId: typebot.id }))
            }
            size="sm"
          />
        )}
        <HStack spacing={1}>
          {typebot && (
            <EditableEmojiOrImageIcon
              uploadFileProps={{
                workspaceId: typebot.workspaceId,
                typebotId: typebot.id,
                fileName: 'icon',
              }}
              icon={typebot?.icon}
              onChangeIcon={handleChangeIcon}
            />
          )}
          (
          <EditableTypebotName
            key={`typebot-name-${typebot?.name ?? ''}`}
            defaultName={typebot?.name ?? ''}
            onNewName={handleNameSubmit}
          />
          )
        </HStack>

        {currentUserMode === 'write' && (
          <HStack>
            <Tooltip
              label={
                isUndoShortcutTooltipOpen
                  ? t('editor.header.undo.tooltip.label')
                  : t('editor.header.undoButton.label')
              }
              isOpen={isUndoShortcutTooltipOpen ? true : undefined}
              hasArrow={isUndoShortcutTooltipOpen}
            >
              <IconButton
                display={['none', 'flex']}
                icon={<UndoIcon />}
                size="sm"
                aria-label={t('editor.header.undoButton.label')}
                onClick={undo}
                isDisabled={!canUndo}
              />
            </Tooltip>

            <Tooltip
              label={
                isRedoShortcutTooltipOpen
                  ? t('editor.header.undo.tooltip.label')
                  : t('editor.header.redoButton.label')
              }
              isOpen={isRedoShortcutTooltipOpen ? true : undefined}
              hasArrow={isRedoShortcutTooltipOpen}
            >
              <IconButton
                display={['none', 'flex']}
                icon={<RedoIcon />}
                size="sm"
                aria-label={t('editor.header.redoButton.label')}
                onClick={redo}
                isDisabled={!canRedo}
              />
            </Tooltip>
          </HStack>
        )}
        {/* <Button
          leftIcon={<BuoyIcon />}
          onClick={onHelpClick}
          size="sm"
          iconSpacing={{ base: 0, xl: 2 }}
        >
          <chakra.span display={{ base: 'none', xl: 'inline' }}>
            {t('editor.header.helpButton.label')}
          </chakra.span>
        </Button> */}
      </HStack>
      {isSavingLoading && (
        <HStack>
          <Spinner speed="0.7s" size="sm" color="gray.400" />
          <Text fontSize="sm" color="gray.400">
            {t('editor.header.savingSpinner.label')}
          </Text>
        </HStack>
      )}
    </HStack>
  )
}

const RightElements = ({
  isResultsDisplayed,
  ...props
}: StackProps & { isResultsDisplayed: boolean }) => {
  const router = useRouter()
  const { t } = useTranslate()
  const { typebot, currentUserMode, save, isSavingLoading } = useTypebot()
  const {
    setRightPanel,
    rightPanel,
    setStartPreviewAtGroup,
    setStartPreviewAtEvent,
  } = useEditor()

  const handlePreviewClick = async () => {
    setStartPreviewAtGroup(undefined)
    setStartPreviewAtEvent(undefined)
    await save()
    setRightPanel(RightPanel.PREVIEW)
  }

  return (
    <HStack {...props}>
      <TypebotNav
        display={{ base: 'none', md: 'flex', xl: 'none' }}
        typebotId={typebot?.id}
        isResultsDisplayed={isResultsDisplayed}
      />
      {/* <Flex pos="relative">
        <ShareTypebotButton isLoading={isNotDefined(typebot)} />
      </Flex> */}
      {router.pathname.includes('/edit') &&
        rightPanel !== RightPanel.PREVIEW && (
          <Button
            colorScheme="gray"
            onClick={handlePreviewClick}
            isLoading={isNotDefined(typebot) || isSavingLoading}
            leftIcon={<PlayIcon />}
            size="sm"
            iconSpacing={{ base: 0, xl: 2 }}
          >
            <chakra.span display={{ base: 'none', xl: 'inline' }}>
              {t('editor.header.previewButton.label')}
            </chakra.span>
          </Button>
        )}
      {currentUserMode === 'guest' && (
        <Button
          as={Link}
          href={`/typebots/${typebot?.id}/duplicate`}
          leftIcon={<CopyIcon />}
          isLoading={isNotDefined(typebot)}
          size="sm"
        >
          Duplicate
        </Button>
      )}
      {currentUserMode === 'write' && <PublishButton size="sm" />}
    </HStack>
  )
}

const TypebotNav = ({
  typebotId,
  isResultsDisplayed,
  ...stackProps
}: {
  typebotId?: string
  isResultsDisplayed: boolean
} & StackProps) => {
  const { t } = useTranslate()
  const router = useRouter()

  return (
    <HStack {...stackProps}>
      {router.query.embedded !== 'true' && (
        <Button
          as={Link}
          href={`/typebots/${typebotId}/edit`}
          colorScheme={router.pathname.includes('/edit') ? 'blue' : 'gray'}
          variant={router.pathname.includes('/edit') ? 'outline' : 'ghost'}
          size="sm"
        >
          {t('editor.header.flowButton.label')}
        </Button>
      )}
      {/* <Button
        as={Link}
        href={`/typebots/${typebotId}/theme`}
        colorScheme={router.pathname.endsWith('theme') ? 'blue' : 'gray'}
        variant={router.pathname.endsWith('theme') ? 'outline' : 'ghost'}
        size="sm"
      >
        {t('editor.header.themeButton.label')}
      </Button> */}
      {/* <Button
        as={Link}
        href={`/typebots/${typebotId}/settings`}
        colorScheme={router.pathname.endsWith('settings') ? 'blue' : 'gray'}
        variant={router.pathname.endsWith('settings') ? 'outline' : 'ghost'}
        size="sm"
      >
        {t('editor.header.settingsButton.label')}
      </Button> */}
      {router.query.embedded !== 'true' && (
        <Button
          as={Link}
          href={`/typebots/${typebotId}/share`}
          colorScheme={router.pathname.endsWith('share') ? 'blue' : 'gray'}
          variant={router.pathname.endsWith('share') ? 'outline' : 'ghost'}
          size="sm"
        >
          {t('share.button.label')}
        </Button>
      )}
      {isResultsDisplayed && router.query.embedded !== 'true' && (
        <Button
          as={Link}
          href={`/typebots/${typebotId}/results`}
          colorScheme={router.pathname.includes('results') ? 'blue' : 'gray'}
          variant={router.pathname.includes('results') ? 'outline' : 'ghost'}
          size="sm"
        >
          {t('editor.header.resultsButton.label')}
        </Button>
      )}
    </HStack>
  )
}

const EditingIndicator = ({
  editingUserEmail,
  editingUserName,
  editingQueue,
}: {
  editingUserEmail?: string | null
  editingUserName?: string | null
  queuePosition: number | null
  editingQueue: {
    userId: string
    position: number
    userEmail?: string | null
    userName?: string | null
  }[]
}) => {
  const { t } = useTranslate()
  const router = useRouter()
  const { typebot } = useTypebot()
  const { mutate: duplicateTypebot, isLoading: isDuplicating } =
    trpc.typebot.importTypebot.useMutation({
      onSuccess: (data) => {
        router.push(`/typebots/${data.typebot.id}/edit`)
      },
    })

  const handleDuplicate = () => {
    if (!typebot?.workspaceId || !typebot) return
    duplicateTypebot({
      workspaceId: typebot.workspaceId,
      typebot: {
        ...typebot,
        name: `${typebot.name} ${t('editor.header.user.duplicateSuffix')}`,
      },
    })
  }

  const getAvatarColor = (email: string) => {
    const colors = [
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'blue',
      'cyan',
      'purple',
      'pink',
    ]
    const index = email.length % colors.length
    return colors[index]
  }

  return (
    <Box
      pos="absolute"
      top="12px"
      right="120px"
      zIndex={1000}
      display={{ base: 'none', md: 'flex' }}
      alignItems="center"
      gap={2}
    >
      <Tooltip
        label={`${editingUserName} ${t('editor.header.user.editing')}`}
        hasArrow
      >
        <Avatar
          size="sm"
          name={editingUserName || editingUserEmail || ''}
          bg={
            editingUserEmail
              ? `${getAvatarColor(editingUserEmail)}.500`
              : 'gray.500'
          }
          color="white"
          fontSize="xs"
          border="2px solid"
          borderColor="orange.400"
          _hover={{
            transform: 'scale(1.1)',
            transition: 'transform 0.2s',
          }}
        />
      </Tooltip>
      {editingQueue.length > 0 && (
        <HStack spacing={1} ml={2}>
          {editingQueue.map((entry) => (
            <Tooltip
              key={entry.userId}
              label={`#${entry.position} - ${entry.userId} (na fila)`}
              hasArrow
            >
              <Avatar
                size="xs"
                name={entry.userId}
                bg={`${getAvatarColor(entry.userId)}.400`}
                color="white"
                fontSize="2xs"
                border="1px solid"
                borderColor="purple.300"
              />
            </Tooltip>
          ))}
        </HStack>
      )}

      <Tooltip label={t('editor.header.user.readonly.tooltip')} hasArrow>
        <Badge
          colorScheme="orange"
          variant="solid"
          fontSize="xs"
          px={3}
          py={1}
          borderRadius="full"
        >
          {t('editor.header.user.readonly.badge.label')}
        </Badge>
      </Tooltip>

      <Tooltip label={t('editor.header.user.duplicate.tooltip')} hasArrow>
        <Button
          size="sm"
          colorScheme="blue"
          variant="solid"
          leftIcon={<CopyIcon />}
          onClick={handleDuplicate}
          isLoading={isDuplicating}
          loadingText={t('editor.header.user.duplicating.loadingText')}
          fontSize="xs"
          px={3}
          py={1}
        >
          {t('duplicate')}
        </Button>
      </Tooltip>
    </Box>
  )
}
