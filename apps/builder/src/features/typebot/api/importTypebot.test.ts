import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { importTypebot } from './importTypebot'
import { WorkspaceRole, Plan } from '@typebot.io/prisma'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'
import { parseTestTypebot } from '@typebot.io/playwright/databaseHelpers'
import prisma from '@typebot.io/lib/prisma'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    workspace: {
      findUnique: vi.fn(),
    },
    typebot: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))
vi.mock('@typebot.io/telemetry/trackEvents', () => ({
  trackEvents: vi.fn(),
}))
vi.mock('@typebot.io/migrations/migrateTypebot', () => ({
  migrateTypebot: vi.fn((t) => t),
}))
vi.mock('../helpers/sanitizers', () => ({
  sanitizeFolderId: vi.fn(() => undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sanitizeGroups: vi.fn(() => (groups: any) => groups),
  sanitizeSettings: vi.fn((s) => s),
  sanitizeVariables: vi.fn(() => []),
}))
vi.mock('@/features/workspace/helpers/getUserRoleInWorkspace', () => ({
  getUserRoleInWorkspace: vi.fn(),
}))

describe('importTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }
  const mockWorkspace = {
    id: 'ws-1',
    members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    plan: Plan.FREE,
  }

  const toolTypebot = (name: string) =>
    parseTestTypebot({
      version: '6',
      name,
      tenant: 'ten-1',
      toolDescription: 'desc',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: { general: { type: 'TOOL' } } as any,
    })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWorkspace as any
    )
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([])
    vi.mocked(getUserRoleInWorkspace).mockReturnValue(WorkspaceRole.ADMIN)
  })

  const caller = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router({ importTypebot }).createCaller({ user: mockUser } as never)
      .importTypebot

  it('should throw if an imported TOOL name sanitizes to an empty MCP name', async () => {
    await expect(
      caller()({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: toolTypebot('!!!') as any,
      })
    ).rejects.toThrow('at least one letter or number')
  })

  it('should throw if an imported TOOL collides with an existing tool in the tenant', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'Get Order' } as any,
    ])

    await expect(
      caller()({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: toolTypebot('get order') as any,
      })
    ).rejects.toThrow('already exists in this tenant')
  })
})
