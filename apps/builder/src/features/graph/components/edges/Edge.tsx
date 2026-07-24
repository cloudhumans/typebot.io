import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Edge as EdgeProps } from '@typebot.io/schemas'
import {
  chakra,
  keyframes,
  Portal,
  useColorMode,
  useDisclosure,
} from '@chakra-ui/react'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { colors } from '@/lib/theme'
import { useEndpoints } from '../../providers/EndpointsProvider'
import { computeEdgePath } from '../../helpers/computeEdgePath'
import { getAnchorsPosition } from '../../helpers/getAnchorsPosition'
import { useGraph } from '../../providers/GraphProvider'
import { EdgeMenu } from './EdgeMenu'
import { useEventsCoordinates } from '../../providers/EventsCoordinateProvider'
import { eventWidth, groupWidth } from '../../constants'
import { useGroupsStore } from '../../hooks/useGroupsStore'
import { useShallow } from 'zustand/react/shallow'

// "Formiguinhas" na última edge percorrida — dá sensação de avanço/direção.
const marchingAnts = keyframes`
  from { stroke-dashoffset: 14; }
  to { stroke-dashoffset: 0; }
`

type Props = {
  edge: EdgeProps
  fromGroupId: string | undefined
}

export const Edge = ({ edge, fromGroupId }: Props) => {
  const isDark = useColorMode().colorMode === 'dark'
  const { deleteEdge } = useTypebot()
  const {
    previewingEdge,
    graphPosition,
    isReadOnly,
    setPreviewingEdge,
    visitedEdgeIds,
  } = useGraph()
  const { sourceEndpointYOffsets, targetEndpointYOffsets } = useEndpoints()
  const fromGroupCoordinates = useGroupsStore(
    useShallow((state) =>
      fromGroupId && state.groupsCoordinates
        ? state.groupsCoordinates[fromGroupId]
        : undefined
    )
  )
  const toGroupCoordinates = useGroupsStore(
    useShallow((state) =>
      state.groupsCoordinates
        ? state.groupsCoordinates[edge.to.groupId]
        : undefined
    )
  )

  const { eventsCoordinates } = useEventsCoordinates()
  const [isMouseOver, setIsMouseOver] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [edgeMenuPosition, setEdgeMenuPosition] = useState({ x: 0, y: 0 })

  const isPreviewing = isMouseOver || previewingEdge?.id === edge.id
  // Edge faz parte do rastro de execução do Test (caminho já percorrido).
  // `visitedEdgeIds` vem com repetições (loops), então dá pra contar passagens.
  const visitedCount = visitedEdgeIds.reduce(
    (count, id) => (id === edge.id ? count + 1 : count),
    0
  )
  const isVisited = visitedCount > 0
  const isLastTraversed =
    visitedEdgeIds.length > 0 &&
    visitedEdgeIds[visitedEdgeIds.length - 1] === edge.id

  // Ponto médio da edge para posicionar o rótulo "×N" das passagens repetidas.
  const visiblePathRef = useRef<SVGPathElement | null>(null)
  const [labelPosition, setLabelPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  const sourceElementCoordinates =
    'eventId' in edge.from
      ? eventsCoordinates[edge.from.eventId]
      : fromGroupCoordinates

  const sourceTop = useMemo(() => {
    const endpointId =
      'eventId' in edge.from
        ? edge.from.eventId
        : edge?.from.itemId ?? edge?.from.blockId
    if (!endpointId) return
    return sourceEndpointYOffsets.get(endpointId)?.y
  }, [edge.from, sourceEndpointYOffsets])

  const targetTop = useMemo(() => {
    if (targetEndpointYOffsets.size === 0) return
    if (edge.to.blockId) {
      const targetOffset = targetEndpointYOffsets.get(edge.to.blockId)
      if (!targetOffset) {
        // Something went wrong, the edge is connected to a block that doesn't exist anymore.
        deleteEdge(edge.id)
        return
      }
      return targetOffset.y
    }
    return
  }, [deleteEdge, edge.id, edge.to.blockId, targetEndpointYOffsets])

  const path = useMemo(() => {
    if (!sourceElementCoordinates || !toGroupCoordinates || !sourceTop)
      return ``
    const anchorsPosition = getAnchorsPosition({
      sourceGroupCoordinates: sourceElementCoordinates,
      targetGroupCoordinates: toGroupCoordinates,
      elementWidth: 'eventId' in edge.from ? eventWidth : groupWidth,
      sourceTop,
      targetTop,
      graphScale: graphPosition.scale,
    })
    return computeEdgePath(anchorsPosition)
  }, [
    sourceElementCoordinates,
    toGroupCoordinates,
    sourceTop,
    edge.from,
    targetTop,
    graphPosition.scale,
  ])

  useEffect(() => {
    const pathEl = visiblePathRef.current
    if (!pathEl || !path || visitedCount <= 1) {
      setLabelPosition(null)
      return
    }
    try {
      const totalLength = pathEl.getTotalLength()
      const mid = pathEl.getPointAtLength(totalLength / 2)
      setLabelPosition({ x: mid.x, y: mid.y })
    } catch {
      setLabelPosition(null)
    }
  }, [path, visitedCount])

  const handleMouseEnter = () => setIsMouseOver(true)

  const handleMouseLeave = () => setIsMouseOver(false)

  const handleEdgeClick = () => {
    setPreviewingEdge(edge)
  }

  const handleContextMenuTrigger = (e: React.MouseEvent) => {
    if (isReadOnly) return
    e.preventDefault()
    setEdgeMenuPosition({ x: e.clientX, y: e.clientY })
    onOpen()
  }

  const handleDeleteEdge = () => deleteEdge(edge.id)

  return (
    <>
      <path
        data-testid="clickable-edge"
        d={path}
        strokeWidth="18px"
        stroke="white"
        fill="none"
        pointerEvents="stroke"
        style={{ cursor: 'pointer', visibility: 'hidden' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleEdgeClick}
        onContextMenu={handleContextMenuTrigger}
      />
      <chakra.path
        ref={visiblePathRef}
        data-testid="edge"
        d={path}
        stroke={
          isVisited
            ? colors.orange[500]
            : isPreviewing
            ? colors.blue[400]
            : isDark
            ? colors.gray[700]
            : colors.gray[400]
        }
        strokeWidth={isVisited ? '4px' : '2px'}
        markerEnd={
          isVisited
            ? 'url(#trail-arrow)'
            : isPreviewing
            ? 'url(#blue-arrow)'
            : 'url(#arrow)'
        }
        fill="none"
        pointerEvents="none"
        sx={{
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
          // Última edge percorrida: "formiguinhas" laranja avançando.
          ...(isVisited && isLastTraversed
            ? {
                strokeDasharray: '8px 6px',
                animation: `${marchingAnts} 0.7s linear infinite`,
              }
            : {}),
        }}
      />
      {isVisited && visitedCount > 1 && labelPosition && (
        <text
          x={labelPosition.x}
          y={labelPosition.y}
          fill={colors.orange[500]}
          fontSize="13px"
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="central"
          stroke={isDark ? colors.gray[900] : '#ffffff'}
          strokeWidth="3px"
          paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {`×${visitedCount}`}
        </text>
      )}
      <Portal>
        <EdgeMenu
          isOpen={isOpen}
          position={edgeMenuPosition}
          onDeleteEdge={handleDeleteEdge}
          onClose={onClose}
        />
      </Portal>
    </>
  )
}
