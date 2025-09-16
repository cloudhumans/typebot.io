import { env } from '@typebot.io/env'
import { Typebot } from '@typebot.io/schemas'
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useValidation, ValidationError } from '../hooks/useValidation'
import { useTypebot } from './TypebotProvider'

import { useUser } from '@/features/account/hooks/useUser'
import { useEditQueue } from '../hooks/useEditQueue'

type MinimalTypebot = Pick<Typebot, 'groups' | 'edges'>

export enum RightPanel {
  PREVIEW,
  VARIABLES,
  VALIDATION_ERRORS,
}

export type SocketUser = {
  id: string
  name?: string
  email?: string
}

export type SocketOnlineData = {
  count: number
  users: Array<SocketUser>
}

const editorContext = createContext<{
  rightPanel?: RightPanel
  setRightPanel: Dispatch<SetStateAction<RightPanel | undefined>>
  startPreviewAtGroup: string | undefined
  setStartPreviewAtGroup: Dispatch<SetStateAction<string | undefined>>
  startPreviewAtEvent: string | undefined
  setStartPreviewAtEvent: Dispatch<SetStateAction<string | undefined>>
  validationErrors: ValidationError | null
  setValidationErrors: Dispatch<SetStateAction<ValidationError | null>>
  validateTypebot: (typebot: MinimalTypebot) => Promise<ValidationError | null>
  clearValidationErrors: () => void
  isValidating: boolean
  isSidebarExtended: boolean
  setIsSidebarExtended: Dispatch<SetStateAction<boolean>>
  isUserEditing: boolean
  onlineData: SocketOnlineData | null
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
}>({})

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const { typebot, setIsSocketEditor } = useTypebot()
  const [rightPanel, setRightPanel] = useState<RightPanel>()
  const [startPreviewAtGroup, setStartPreviewAtGroup] = useState<string>()
  const [startPreviewAtEvent, setStartPreviewAtEvent] = useState<string>()
  const [isSidebarExtended, setIsSidebarExtended] = useState(true)

  const [onlineData] = useState<SocketOnlineData | null>(null)

  const { user: currentUser } = useUser()

  const {
    isLoading,
    joinQueue,
    updateActivity,
    getPositionInQueue,
    getFirstInQueue,
  } = useEditQueue(typebot?.id)

  // trpc.onlineUsers.subscribe.useSubscription(
  //   {
  //     typebotId: typebot?.id ?? '',
  //     user: {
  //       id: currentUser?.id ?? '',
  //       name: currentUser?.name ?? undefined,
  //       email: currentUser?.email ?? undefined,
  //     },
  //   },
  //   {
  //     enabled: !!typebot?.id,
  //     onData: (data) => {
  //       setOnlineData(data)
  //     },
  //     onError: (error) => {
  //       console.error('Error in online users subscription:', error)
  //     },
  //   }
  // )

  const userWithEditingRights = getFirstInQueue()
  const isUserEditing = userWithEditingRights?.userId === currentUser?.id

  const {
    validationErrors,
    setValidationErrors,
    validateTypebot,
    clearValidationErrors,
    isValidating,
  } = useValidation()

  const isRunningRef = useRef(false)
  const pendingTypebotRef = useRef<MinimalTypebot | null>(null)
  const [validationKey, setValidationKey] = useState<string | null>(null)

  const queuedValidateTypebot = useCallback(
    async (currentTypebot: MinimalTypebot) => {
      if (isRunningRef.current) {
        pendingTypebotRef.current = currentTypebot
        return null
      }
      isRunningRef.current = true
      try {
        return await validateTypebot(currentTypebot)
      } finally {
        isRunningRef.current = false
        if (pendingTypebotRef.current) {
          const next = pendingTypebotRef.current
          pendingTypebotRef.current = null
          queuedValidateTypebot(next)
        }
      }
    },
    [validateTypebot]
  )

  useEffect(() => {
    if (!typebot?.id || isLoading) return

    joinQueue(currentUser?.id ?? '')

    // Se já está, inicia polling a cada 5s
    const intervalId = setInterval(() => {
      updateActivity()
    }, 5000)

    // Cleanup ao desmontar ou mudar o typebotId
    return () => {
      clearInterval(intervalId)
      console.log('------CAINDO AQUI')
    }
  }, [typebot?.id, currentUser?.id])

  useEffect(() => {
    const position = getPositionInQueue(currentUser?.id ?? '')

    console.log('getPositionInQueue', position)

    if (position === 1) {
      setIsSocketEditor(true)
      console.log('---getPositionInQueue---SOCKET EDITOR')
    } else {
      setIsSocketEditor(false)
      console.log('---getPositionInQueue---NAO SOCKET EDITOR')
    }
  }, [isUserEditing, setIsSocketEditor, currentUser?.id])

  useEffect(() => {
    if (
      env.NEXT_PUBLIC_DISABLE_VALIDATION ||
      !typebot?.groups ||
      !typebot?.edges
    )
      return

    const newGroupsValidationKey = JSON.stringify(
      typebot.groups.map((group) => ({
        id: group.id,
        title: group.title,
        blocks: group.blocks,
      }))
    )

    const newEdgesValidationKey = JSON.stringify(typebot.edges)
    const newValidationKey = `${newGroupsValidationKey}-${newEdgesValidationKey}`

    if (newValidationKey === validationKey) return

    setValidationKey(newValidationKey)

    const minimalTypebot: MinimalTypebot = {
      groups: typebot.groups,
      edges: typebot.edges,
    }
    queuedValidateTypebot(minimalTypebot)
  }, [validationKey, typebot?.edges, typebot?.groups, queuedValidateTypebot])

  return (
    <editorContext.Provider
      value={{
        rightPanel,
        setRightPanel,
        startPreviewAtGroup,
        setStartPreviewAtGroup,
        startPreviewAtEvent,
        setStartPreviewAtEvent,
        validationErrors,
        setValidationErrors,
        validateTypebot: queuedValidateTypebot,
        clearValidationErrors,
        isValidating,
        isSidebarExtended,
        setIsSidebarExtended,
        isUserEditing,
        onlineData,
      }}
    >
      {children}
    </editorContext.Provider>
  )
}

export const useEditor = () => useContext(editorContext)
