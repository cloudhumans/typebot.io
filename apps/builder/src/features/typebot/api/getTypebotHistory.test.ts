import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { getTypebotHistory } from './getTypebotHistory'
import prisma from '@typebot.io/lib/prisma'
import { isReadTypebotForbidden } from '../helpers/isReadTypebotForbidden'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
    },
    typebotHistory: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))
vi.mock('../helpers/isReadTypebotForbidden', () => ({
  isReadTypebotForbidden: vi.fn(),
}))

describe('getTypebotHistory', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }
  const createdAt = new Date('2026-01-01')

  const snapshot = (overrides: Record<string, unknown>) => ({
    id: 'hist-1',
    createdAt,
    origin: 'PUBLISH',
    version: '6',
    isRestored: false,
    restoredFromId: null,
    publishedAt: createdAt,
    author: null,
    ...overrides,
  })

  const caller = () =>
    router({ getTypebotHistory }).createCaller({ user: mockUser } as never)
      .getTypebotHistory

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isReadTypebotForbidden).mockResolvedValue(false)
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      id: 'tb-1',
      workspaceId: 'ws-1',
      collaborators: [],
      workspace: {
        id: 'ws-1',
        isSuspended: false,
        isPastDue: false,
        members: [],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(prisma.typebotHistory.count).mockResolvedValue(1)
    vi.mocked(prisma.typebotHistory.findFirst).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { createdAt } as any
    )
  })

  it('flags an inconsistent snapshot from SQL without loading its arrays when content is excluded', async () => {
    vi.mocked(prisma.typebotHistory.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot({}) as any,
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'hist-1', hasDanglingReferences: true },
    ])

    const result = await caller()({
      typebotId: 'tb-1',
      limit: 20,
      excludeContent: true,
    })

    expect(result.history[0].hasDanglingReferences).toBe(true)
    expect(result.history[0].content).toBeUndefined()
    const select = vi.mocked(prisma.typebotHistory.findMany).mock.calls[0][0]
      ?.select as Record<string, unknown>
    expect(select.groups).toBeUndefined()
    expect(select.edges).toBeUndefined()
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('returns hasDanglingReferences false alongside content for a consistent snapshot', async () => {
    vi.mocked(prisma.typebotHistory.findMany).mockResolvedValue([
      snapshot({
        name: 'Flow',
        icon: null,
        groups: [],
        events: [],
        variables: [],
        edges: [],
        theme: {},
        settings: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    ])
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'hist-1', hasDanglingReferences: false },
    ])

    const result = await caller()({ typebotId: 'tb-1', limit: 20 })

    expect(result.history[0].hasDanglingReferences).toBe(false)
    expect(result.history[0].content?.name).toBe('Flow')
  })

  it('skips the SQL lookup when the page is empty', async () => {
    vi.mocked(prisma.typebotHistory.findMany).mockResolvedValue([])
    vi.mocked(prisma.typebotHistory.count).mockResolvedValue(0)
    vi.mocked(prisma.typebotHistory.findFirst).mockResolvedValue(null)

    const result = await caller()({ typebotId: 'tb-1', limit: 20 })

    expect(result.history).toEqual([])
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})
