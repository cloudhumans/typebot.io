import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { listTypebots } from './listTypebots'
import { WorkspaceRole } from '@typebot.io/prisma'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'
import prisma from '@typebot.io/lib/prisma'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    workspace: {
      findUnique: vi.fn(),
    },
    typebot: {
      findMany: vi.fn(),
    },
  },
}))
vi.mock('@/features/workspace/helpers/getUserRoleInWorkspace', () => ({
  getUserRoleInWorkspace: vi.fn(),
}))

describe('listTypebots', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }
  const mockWorkspace = {
    id: 'ws-1',
    name: 'WS',
    members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
  }

  const toolTypebot = {
    id: 'tool-1',
    name: 'Get Order Status',
    icon: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    settings: { general: { type: 'TOOL' } },
    publishedTypebot: null,
  }
  const normalTypebot = {
    id: 'flow-1',
    name: 'Flow',
    icon: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    settings: { general: { type: 'default' } },
    publishedTypebot: { id: 'pub-1' },
  }
  const enrichmentTypebot = {
    id: 'ce-1',
    name: 'Enrich Contact',
    icon: null,
    createdAt: new Date('2026-01-03T00:00:00Z'),
    settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
    publishedTypebot: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWorkspace as any
    )
    vi.mocked(getUserRoleInWorkspace).mockReturnValue(WorkspaceRole.ADMIN)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caller = () =>
    router({ listTypebots }).createCaller({ user: mockUser } as never)
      .listTypebots

  it('marks a TOOL-type typebot with isTool: true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([toolTypebot] as any)

    const { typebots } = await caller()({ workspaceId: mockWorkspace.id })

    expect(typebots).toHaveLength(1)
    expect(typebots[0].isTool).toBe(true)
  })

  it('keeps non-TOOL workflows with isTool: false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([normalTypebot] as any)

    const { typebots } = await caller()({ workspaceId: mockWorkspace.id })

    expect(typebots).toHaveLength(1)
    expect(typebots[0].isTool).toBe(false)
    expect(typebots[0].publishedTypebotId).toBe('pub-1')
  })

  it('still flags TOOL typebots whose other settings fields are invalid', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      {
        ...toolTypebot,
        settings: { general: { type: 'TOOL' }, typingEmulation: 'nonsense' },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({ workspaceId: mockWorkspace.id })

    expect(typebots[0].isTool).toBe(true)
  })

  it('excludes TOOL workflows when excludeTools is true', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      normalTypebot,
      toolTypebot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({
      workspaceId: mockWorkspace.id,
      excludeTools: true,
    })

    expect(typebots).toHaveLength(1)
    expect(typebots[0].id).toBe('flow-1')
  })

  it('returns the type of each typebot', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      toolTypebot,
      normalTypebot,
      enrichmentTypebot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({ workspaceId: mockWorkspace.id })

    expect(
      typebots.map((t) => ({ id: t.id, type: t.type, isTool: t.isTool }))
    ).toEqual([
      { id: 'tool-1', type: 'TOOL', isTool: true },
      { id: 'flow-1', type: 'default', isTool: false },
      { id: 'ce-1', type: 'CONTEXT_ENRICHMENT', isTool: false },
    ])
  })

  it('filters by type when requested', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      toolTypebot,
      normalTypebot,
      enrichmentTypebot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({
      workspaceId: mockWorkspace.id,
      type: 'CONTEXT_ENRICHMENT',
    })

    expect(typebots.map((t) => t.id)).toEqual(['ce-1'])
  })

  it('excludeTools hides CONTEXT_ENRICHMENT flows as well', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      toolTypebot,
      normalTypebot,
      enrichmentTypebot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({
      workspaceId: mockWorkspace.id,
      excludeTools: true,
    })

    expect(typebots.map((t) => t.id)).toEqual(['flow-1'])
  })

  it('returns both flows and tools when excludeTools is not set', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      normalTypebot,
      toolTypebot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const { typebots } = await caller()({ workspaceId: mockWorkspace.id })

    expect(typebots).toHaveLength(2)
  })
})
