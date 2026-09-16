import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { postTypebotValidation } from './typebotValidation'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    publicTypebot: {
      findUnique: vi.fn(),
    },
    credentials: {
      findMany: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
    },
  },
}))

describe('postTypebotValidation', () => {
  const edges = [
    {
      id: 'edge-1',
      from: { eventId: 'event-1' },
      to: { groupId: 'group-1' },
    },
  ]

  const groups = [
    {
      id: 'group-1',
      title: 'Group #1',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: 'block-1',
          type: 'text' as const,
          content: { plainText: 'Contexto do pedido', richText: [] },
        },
      ],
    },
  ]

  const caller = () =>
    router({ postTypebotValidation }).createCaller({ user: undefined } as never)
      .postTypebotValidation

  const returnOutputGroups = [
    {
      id: 'group-1',
      title: 'Group #1',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: 'block-1',
          type: 'workflow',
          options: {
            action: 'Return Output',
            responseType: 'Custom JSON',
            customJson: '{}',
          },
        },
      ],
    },
  ]

  const validate = (
    type?: 'default' | 'TOOL' | 'CONTEXT_ENRICHMENT',
    flowGroups: unknown[] = groups
  ) =>
    caller()({
      typebot: {
        variables: [],
        groups: flowGroups as never,
        edges,
        settings: type ? { general: { type } } : undefined,
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('flags an edge into a missing group as a blocking error and a stale outgoingEdgeId as a warning', async () => {
    const { isValid, errors } = await caller()({
      typebot: {
        variables: [],
        groups: [
          {
            id: 'group-1',
            title: 'Group #1',
            graphCoordinates: { x: 0, y: 0 },
            blocks: [
              {
                id: 'block-1',
                type: 'text',
                content: { richText: [] },
                outgoingEdgeId: 'edge-to-nowhere',
              },
              {
                id: 'block-2',
                type: 'text',
                content: { richText: [] },
                outgoingEdgeId: 'edge-gone',
              },
            ],
          },
        ] as never,
        edges: [
          {
            id: 'edge-to-nowhere',
            from: { blockId: 'block-1' },
            to: { groupId: 'group-gone' },
          },
        ],
        settings: { general: { type: 'TOOL' } },
      },
    })

    expect(isValid).toBe(false)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'danglingEdgeTarget',
          severity: 'error',
          groupId: 'group-1',
        }),
        expect.objectContaining({
          type: 'staleEdgeReference',
          severity: 'warning',
          groupId: 'group-1',
        }),
      ])
    )
  })

  it('does not warn about an edge leaving the start event when events are provided', async () => {
    const { errors } = await caller()({
      typebot: {
        variables: [],
        groups: returnOutputGroups as never,
        edges,
        events: [
          {
            id: 'event-1',
            type: 'start',
            graphCoordinates: { x: 0, y: 0 },
            outgoingEdgeId: 'edge-1',
          },
        ],
        settings: { general: { type: 'TOOL' } },
      },
    })

    expect(errors.filter((e) => e.type === 'staleEdgeReference')).toEqual([])
    expect(errors.filter((e) => e.type === 'danglingEdgeTarget')).toEqual([])
  })

  it('should flag a controlled flow whose branch never reaches a ClaudIA block', async () => {
    const { errors } = await validate('default')

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missingClaudiaInFlowBranches',
          groupId: 'group-1',
        }),
      ])
    )
  })

  it('should flag a controlled flow with no explicit type the same way', async () => {
    const { errors } = await validate()

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'missingClaudiaInFlowBranches' }),
      ])
    )
  })

  it('should flag a TOOL flow whose branch never reaches a Tool Output block', async () => {
    const { errors } = await validate('TOOL')

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missingWorkflowEndInFlowBranches',
          groupId: 'group-1',
        }),
      ])
    )
    expect(errors.some((e) => e.type === 'missingClaudiaInFlowBranches')).toBe(
      false
    )
  })

  it('should flag a CONTEXT_ENRICHMENT branch that never reaches a Return Output block, never asking for a ClaudIA block', async () => {
    const { errors } = await validate('CONTEXT_ENRICHMENT')

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missingWorkflowEndInFlowBranches',
          groupId: 'group-1',
        }),
      ])
    )
    expect(errors.some((e) => e.type === 'missingClaudiaInFlowBranches')).toBe(
      false
    )
  })

  it('should accept a CONTEXT_ENRICHMENT branch that ends in a Return Output block', async () => {
    const { errors } = await validate('CONTEXT_ENRICHMENT', returnOutputGroups)

    expect(
      errors.some((e) => e.type === 'missingWorkflowEndInFlowBranches')
    ).toBe(false)
    expect(errors.some((e) => e.type === 'missingClaudiaInFlowBranches')).toBe(
      false
    )
  })
})
