import { vi, describe, it, expect, beforeEach } from 'vitest'
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

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace as any)
    vi.mocked(getUserRoleInWorkspace).mockReturnValue(WorkspaceRole.ADMIN)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caller = () => listTypebots.createCaller({ user: mockUser } as any)

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
