import {
  PublicTypebot,
  PublicTypebotV6,
  TypebotV6,
  typebotV6Schema,
} from '@typebot.io/schemas'
import { Router } from 'next/router'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { isDefined, omit } from '@typebot.io/lib'
import { edgesAction, EdgesActions } from './typebotActions/edges'
import { itemsAction, ItemsActions } from './typebotActions/items'
import { GroupsActions, groupsActions } from './typebotActions/groups'
import { blocksAction, BlocksActions } from './typebotActions/blocks'
import { variablesAction, VariablesActions } from './typebotActions/variables'
import { dequal } from 'dequal'
import { useToast } from '@/hooks/useToast'
import { useUndo } from '../hooks/useUndo'
import { useAutoSave } from '@/hooks/useAutoSave'
import { preventUserFromRefreshing } from '@/helpers/preventUserFromRefreshing'
import { areTypebotsEqual } from '@/features/publish/helpers/areTypebotsEqual'
import { isPublished as isPublishedHelper } from '@/features/publish/helpers/isPublished'
import { convertPublicTypebotToTypebot } from '@/features/publish/helpers/convertPublicTypebotToTypebot'
import { trpc } from '@/lib/trpc'
import { EventsActions, eventsActions } from './typebotActions/events'
import { useGroupsStore } from '@/features/graph/hooks/useGroupsStore'
import { useUser } from '@/features/account/hooks/useUser'

const autoSaveTimeout = 10000

type UpdateTypebotPayload = Partial<
  Pick<
    TypebotV6,
    | 'theme'
    | 'selectedThemeTemplateId'
    | 'settings'
    | 'publicId'
    | 'name'
    | 'icon'
    | 'customDomain'
    | 'resultsTablePreferences'
    | 'isClosed'
    | 'whatsAppCredentialsId'
    | 'riskLevel'
    | 'isBeingEdited'
    | 'editingUserEmail'
    | 'editingUserName'
    | 'editingStartedAt'
  >
>

export type SetTypebot = (
  newPresent: TypebotV6 | ((current: TypebotV6) => TypebotV6)
) => void

const typebotContext = createContext<
  {
    typebot?: TypebotV6
    publishedTypebot?: PublicTypebotV6
    publishedTypebotVersion?: PublicTypebot['version']
    currentUserMode: 'guest' | 'read' | 'write'
    is404: boolean
    isPublished: boolean
    isSavingLoading: boolean
    isReadOnlyDueToEditing: boolean
    editingUserEmail?: string | null
    editingUserName?: string | null
    canEditNow: boolean
    dismissEditNotification: () => void
    save: () => Promise<void>
    undo: () => void
    redo: () => void
    canRedo: boolean
    canUndo: boolean
    updateTypebot: (props: {
      updates: UpdateTypebotPayload
      save?: boolean
    }) => Promise<TypebotV6 | undefined>
    restorePublishedTypebot: () => void
  } & GroupsActions &
    BlocksActions &
    ItemsActions &
    VariablesActions &
    EdgesActions &
    EventsActions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
>({})

export const TypebotProvider = ({
  children,
  typebotId,
}: {
  children: ReactNode
  typebotId?: string
}) => {
  const { showToast } = useToast()
  const { user } = useUser()
  const [is404, setIs404] = useState(false)
  const [canEditNow, setCanEditNow] = useState(false)
  const [wasInReadonlyMode, setWasInReadonlyMode] = useState(false)
  const setGroupsCoordinates = useGroupsStore(
    (state) => state.setGroupsCoordinates
  )

  const {
    data: typebotData,
    isLoading: isFetchingTypebot,
    refetch: refetchTypebot,
  } = trpc.typebot.getTypebot.useQuery(
    { typebotId: typebotId as string, migrateToLatestVersion: true },
    {
      enabled: isDefined(typebotId),
      retry: 0,
      onError: (error) => {
        if (error.data?.httpStatus === 404) {
          setIs404(true)
          return
        }
        setIs404(false)
        showToast({
          title: 'Could not fetch typebot',
          description: error.message,
          details: {
            content: JSON.stringify(error.data?.zodError?.fieldErrors, null, 2),
            lang: 'json',
          },
        })
      },
      onSuccess: () => {
        setIs404(false)
      },
    }
  )

  const { data: publishedTypebotData } =
    trpc.typebot.getPublishedTypebot.useQuery(
      { typebotId: typebotId as string, migrateToLatestVersion: true },
      {
        enabled:
          isDefined(typebotId) &&
          (typebotData?.currentUserMode === 'read' ||
            typebotData?.currentUserMode === 'write'),
        onError: (error) => {
          showToast({
            title: 'Could not fetch published typebot',
            description: error.message,
            details: {
              content: JSON.stringify(
                error.data?.zodError?.fieldErrors,
                null,
                2
              ),
              lang: 'json',
            },
          })
        },
      }
    )

  const { mutateAsync: updateTypebot, isLoading: isSaving } =
    trpc.typebot.updateTypebot.useMutation({
      onError: (error) =>
        showToast({
          title: 'Error while updating typebot',
          description: error.message,
        }),
      onSuccess: () => {
        if (!typebotId) return
        refetchTypebot()
      },
    })

  const typebot = typebotData?.typebot as TypebotV6
  const publishedTypebot = (publishedTypebotData?.publishedTypebot ??
    undefined) as PublicTypebotV6 | undefined
  const isReadOnly =
    typebotData &&
    ['read', 'guest'].includes(typebotData?.currentUserMode ?? 'guest')

  const isReadOnlyDueToEditing = Boolean(
    typebot?.isBeingEdited &&
      typebot?.editingUserEmail &&
      typebot?.editingUserEmail !== user?.email &&
      typebotData?.currentUserMode === 'read'
  )

  useEffect(() => {
    if (isReadOnlyDueToEditing) {
      setWasInReadonlyMode(true)
      setCanEditNow(false)
    } else if (wasInReadonlyMode && !isReadOnlyDueToEditing) {
      setCanEditNow(true)
    }
  }, [
    isReadOnlyDueToEditing,
    wasInReadonlyMode,
    canEditNow,
    typebot?.editingUserEmail,
    typebotData?.currentUserMode,
  ])

  useEffect(() => {
    if (!isReadOnlyDueToEditing) return

    const interval = setInterval(() => {
      refetchTypebot()
    }, 3000)

    return () => {
      clearInterval(interval)
    }
  }, [isReadOnlyDueToEditing, refetchTypebot])

  const typebotRef = useRef(typebot)
  typebotRef.current = typebot

  const claimEditingStatus = useCallback(async () => {
    if (!typebot || !user?.email || isReadOnly) return

    try {
      await updateTypebot({
        typebotId: typebot.id,
        typebot: {
          isBeingEdited: true,
          editingUserEmail: user.email,
          editingUserName: user.name,
          editingStartedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('Failed to claim editing status:', error)
    }
  }, [typebot, user, isReadOnly, updateTypebot])

  const releaseEditingStatus = useCallback(async () => {
    if (!typebot || !user?.email) return

    try {
      await updateTypebot({
        typebotId: typebot.id,
        typebot: {
          isBeingEdited: false,
          editingUserEmail: null,
          editingUserName: null,
          editingStartedAt: null,
        },
      })
    } catch (error) {
      console.error('❌ Failed to release editing status:', error)
    }
  }, [typebot, user?.email, updateTypebot])

  const releaseEditingStatusSync = useCallback(() => {
    if (!typebot || !user?.email) return

    releaseEditingStatus().catch((error) => {
      console.error('❌ Async release failed, trying sync methods:', error)

      const apiUrl = `/api/typebots/${typebot.id}/release-editing`

      if (navigator.sendBeacon) {
        const success = navigator.sendBeacon(
          apiUrl,
          new Blob([''], { type: 'text/plain' })
        )
        if (success) return
      }

      try {
        fetch(apiUrl, {
          method: 'POST',
          keepalive: true,
        })
          .then((response) => {
            console.log('📡 Sync fetch response:', response.status)
          })
          .catch((err) => {
            console.error('❌ Sync fetch error:', err)
          })
      } catch (error) {
        console.error('❌ All sync methods failed:', error)
      }
    })
  }, [typebot, user?.email, releaseEditingStatus])
  const dismissEditNotification = useCallback(() => {
    setCanEditNow(false)
    setWasInReadonlyMode(false)
  }, [])

  useEffect(() => {
    if (typebot && user?.email && !isReadOnly && !isFetchingTypebot) {
      const timer = setTimeout(() => {
        claimEditingStatus()
      }, 500)

      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typebot?.id, user?.email, isReadOnly, isFetchingTypebot])

  useEffect(() => {
    const handleBeforeUnload = () => {
      const latestTypebot = typebotRef.current
      if (
        latestTypebot?.isBeingEdited &&
        latestTypebot?.editingUserEmail === user?.email
      ) {
        releaseEditingStatusSync()
      }
    }

    const handleRouteChange = () => {
      releaseEditingStatusSync()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const latestTypebot = typebotRef.current
        if (
          latestTypebot?.isBeingEdited &&
          latestTypebot?.editingUserEmail === user?.email
        ) {
          releaseEditingStatusSync()
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload) // iOS Safari
    document.addEventListener('visibilitychange', handleVisibilityChange)
    Router.events.on('routeChangeStart', handleRouteChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      Router.events.off('routeChangeStart', handleRouteChange)
      releaseEditingStatusSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const [
    localTypebot,
    {
      redo,
      undo,
      flush,
      canRedo,
      canUndo,
      set: setLocalTypebot,
      setUpdateDate,
    },
  ] = useUndo<TypebotV6>(undefined, {
    isReadOnly,
    onUndo: (t) => {
      setGroupsCoordinates(t.groups)
    },
    onRedo: (t) => {
      setGroupsCoordinates(t.groups)
    },
  })

  useEffect(() => {
    if (!typebot && isDefined(localTypebot)) {
      setLocalTypebot(undefined)
      setGroupsCoordinates(undefined)
    }
    if (isFetchingTypebot || !typebot) return
    if (
      typebot.id !== localTypebot?.id ||
      new Date(typebot.updatedAt).getTime() >
        new Date(localTypebot.updatedAt).getTime()
    ) {
      setLocalTypebot({ ...typebot })
      setGroupsCoordinates(typebot.groups)
      flush()
    }
  }, [
    flush,
    isFetchingTypebot,
    localTypebot,
    setGroupsCoordinates,
    setLocalTypebot,
    showToast,
    typebot,
  ])

  const saveTypebot = useCallback(
    async (updates?: Partial<TypebotV6>) => {
      if (!localTypebot || !typebot || isReadOnly) return

      const editingUpdates = user?.email
        ? {
            isBeingEdited: true,
            editingUserEmail: user.email,
            editingUserName: user.name,
            editingStartedAt: new Date(),
          }
        : {}

      const typebotToSave = {
        ...localTypebot,
        ...editingUpdates,
        ...updates,
      }

      if (dequal(omit(typebot, 'updatedAt'), omit(typebotToSave, 'updatedAt')))
        return
      const newParsedTypebot = typebotV6Schema.parse({ ...typebotToSave })
      setLocalTypebot(newParsedTypebot)
      try {
        const {
          typebot: { updatedAt },
        } = await updateTypebot({
          typebotId: newParsedTypebot.id,
          typebot: newParsedTypebot,
        })
        setUpdateDate(updatedAt)
      } catch {
        setLocalTypebot({
          ...localTypebot,
        })
      }
    },
    [
      isReadOnly,
      localTypebot,
      setLocalTypebot,
      setUpdateDate,
      typebot,
      updateTypebot,
      user?.email,
      user?.name,
    ]
  )

  useAutoSave(
    {
      handler: saveTypebot,
      item: localTypebot,
      debounceTimeout: autoSaveTimeout,
    },
    [saveTypebot, localTypebot]
  )

  useEffect(() => {
    const handleSaveTypebot = () => {
      saveTypebot()
    }
    Router.events.on('routeChangeStart', handleSaveTypebot)
    return () => {
      Router.events.off('routeChangeStart', handleSaveTypebot)
    }
  }, [saveTypebot])

  const isPublished = useMemo(
    () =>
      isDefined(localTypebot) &&
      isDefined(localTypebot.publicId) &&
      isDefined(publishedTypebot) &&
      isPublishedHelper(localTypebot, publishedTypebot),
    [localTypebot, publishedTypebot]
  )

  useEffect(() => {
    if (!localTypebot || !typebot || isReadOnly) return
    if (!areTypebotsEqual(localTypebot, typebot)) {
      window.addEventListener('beforeunload', preventUserFromRefreshing)
    }

    return () => {
      window.removeEventListener('beforeunload', preventUserFromRefreshing)
    }
  }, [localTypebot, typebot, isReadOnly])

  const updateLocalTypebot = async ({
    updates,
    save,
  }: {
    updates: UpdateTypebotPayload
    save?: boolean
  }) => {
    if (!localTypebot || isReadOnly) return
    const newTypebot = { ...localTypebot, ...updates }
    setLocalTypebot(newTypebot)
    if (save) await saveTypebot(newTypebot)
    return newTypebot
  }

  const restorePublishedTypebot = () => {
    if (!publishedTypebot || !localTypebot) return
    setLocalTypebot(
      convertPublicTypebotToTypebot(publishedTypebot, localTypebot)
    )
  }

  return (
    <typebotContext.Provider
      value={{
        typebot: localTypebot,
        publishedTypebot,
        publishedTypebotVersion: publishedTypebotData?.version,
        currentUserMode: typebotData?.currentUserMode ?? 'guest',
        isSavingLoading: isSaving,
        is404,
        isReadOnlyDueToEditing,
        editingUserEmail: typebot?.editingUserEmail,
        editingUserName: typebot?.editingUserName,
        canEditNow,
        dismissEditNotification,
        save: saveTypebot,
        undo,
        redo,
        canUndo,
        canRedo,
        isPublished,
        updateTypebot: updateLocalTypebot,
        restorePublishedTypebot,
        ...groupsActions(setLocalTypebot as SetTypebot),
        ...blocksAction(setLocalTypebot as SetTypebot),
        ...variablesAction(setLocalTypebot as SetTypebot),
        ...edgesAction(setLocalTypebot as SetTypebot),
        ...itemsAction(setLocalTypebot as SetTypebot),
        ...eventsActions(setLocalTypebot as SetTypebot),
      }}
    >
      {children}
    </typebotContext.Provider>
  )
}

export const useTypebot = () => useContext(typebotContext)
