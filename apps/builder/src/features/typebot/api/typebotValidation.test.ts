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

  const validate = (type?: 'default' | 'TOOL' | 'CONTEXT_ENRICHMENT') =>
    caller()({
      typebot: {
        variables: [],
        groups: groups as never,
        edges,
        settings: type ? { general: { type } } : undefined,
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('should not require a terminator block in a CONTEXT_ENRICHMENT flow', async () => {
    const { errors } = await validate('CONTEXT_ENRICHMENT')

    expect(errors.some((e) => e.type === 'missingClaudiaInFlowBranches')).toBe(
      false
    )
    expect(
      errors.some((e) => e.type === 'missingWorkflowEndInFlowBranches')
    ).toBe(false)
  })
})
