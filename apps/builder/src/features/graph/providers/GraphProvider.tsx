import { Coordinates } from '@dnd-kit/utilities'
import { Edge } from '@typebot.io/schemas'
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useState,
} from 'react'
import { graphPositionDefaultValue } from '../constants'
import { ConnectingIds } from '../types'

type Position = Coordinates & { scale: number }

type PreviewingBlock = {
  id: string
  groupId: string
}

const graphContext = createContext<{
  graphPosition: Position
  setGraphPosition: Dispatch<SetStateAction<Position>>
  connectingIds: ConnectingIds | null
  setConnectingIds: Dispatch<SetStateAction<ConnectingIds | null>>
  previewingBlock?: PreviewingBlock
  setPreviewingBlock: Dispatch<SetStateAction<PreviewingBlock | undefined>>
  previewingEdge?: Edge
  setPreviewingEdge: Dispatch<SetStateAction<Edge | undefined>>
  // Execution trail during the Test preview: ids of every edge already
  // traversed (cumulative), and the block the flow is currently processing
  // from (shows a spinner). Cleared when the Test closes/restarts.
  visitedEdgeIds: string[]
  setVisitedEdgeIds: Dispatch<SetStateAction<string[]>>
  runningBlockId?: string
  setRunningBlockId: Dispatch<SetStateAction<string | undefined>>
  // Per-block execution result during the Test (e.g., HTTP Request success or
  // error), shown as a green/red badge on the block. Cleared with the trail.
  blockResults: Record<string, 'success' | 'error'>
  setBlockResults: Dispatch<
    SetStateAction<Record<string, 'success' | 'error'>>
  >
  // Group ids the Test flow jumped into (loop-backs via a Jump block, which has
  // no drawn edge). Flagged with a ↩ badge on the target group.
  jumpTargetGroupIds: string[]
  setJumpTargetGroupIds: Dispatch<SetStateAction<string[]>>
  openedBlockId?: string
  setOpenedBlockId: Dispatch<SetStateAction<string | undefined>>
  openedItemId?: string
  setOpenedItemId: Dispatch<SetStateAction<string | undefined>>
  isReadOnly: boolean
  isAnalytics: boolean
  focusedGroupId?: string
  setFocusedGroupId: Dispatch<SetStateAction<string | undefined>>
  navigateToPosition?: (position: Position) => void
  registerNavigationCallback?: (callback: (position: Position) => void) => void
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
}>({
  graphPosition: graphPositionDefaultValue({ x: 0, y: 0 }),
  connectingIds: null,
})

export const GraphProvider = ({
  children,
  isReadOnly = false,
  isAnalytics = false,
}: {
  children: ReactNode
  isReadOnly?: boolean
  isAnalytics?: boolean
}) => {
  const [graphPosition, setGraphPosition] = useState(
    graphPositionDefaultValue({ x: 0, y: 0 })
  )
  const [connectingIds, setConnectingIds] = useState<ConnectingIds | null>(null)
  const [previewingEdge, setPreviewingEdge] = useState<Edge>()
  const [previewingBlock, setPreviewingBlock] = useState<PreviewingBlock>()
  const [visitedEdgeIds, setVisitedEdgeIds] = useState<string[]>([])
  const [runningBlockId, setRunningBlockId] = useState<string>()
  const [blockResults, setBlockResults] = useState<
    Record<string, 'success' | 'error'>
  >({})
  const [jumpTargetGroupIds, setJumpTargetGroupIds] = useState<string[]>([])
  const [openedBlockId, setOpenedBlockId] = useState<string>()
  const [openedItemId, setOpenedItemId] = useState<string>()
  const [focusedGroupId, setFocusedGroupId] = useState<string>()
  const [navigationCallback, setNavigationCallback] = useState<
    ((position: Position) => void) | undefined
  >()

  const navigateToPosition = (position: Position) => {
    if (navigationCallback) {
      navigationCallback(position)
    }
  }

  const registerNavigationCallback = useCallback(
    (callback: (position: Position) => void) => {
      setNavigationCallback(() => callback)
    },
    [setNavigationCallback]
  )

  return (
    <graphContext.Provider
      value={{
        graphPosition,
        setGraphPosition,
        connectingIds,
        setConnectingIds,
        previewingEdge,
        setPreviewingEdge,
        visitedEdgeIds,
        setVisitedEdgeIds,
        runningBlockId,
        setRunningBlockId,
        blockResults,
        setBlockResults,
        jumpTargetGroupIds,
        setJumpTargetGroupIds,
        openedBlockId,
        setOpenedBlockId,
        openedItemId,
        setOpenedItemId,
        isReadOnly,
        focusedGroupId,
        setFocusedGroupId,
        setPreviewingBlock,
        previewingBlock,
        isAnalytics,
        navigateToPosition,
        registerNavigationCallback,
      }}
    >
      {children}
    </graphContext.Provider>
  )
}

export const useGraph = () => useContext(graphContext)
