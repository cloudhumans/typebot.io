import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { createTypebot } from './createTypebot'
import { WorkspaceRole, Plan } from '@typebot.io/prisma'
import { getUserRoleInWorkspace } from '@/features/workspace/helpers/getUserRoleInWorkspace'
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
    dashboardFolder: {
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('@typebot.io/telemetry/trackEvents', () => ({
  trackEvents: vi.fn(),
}))
vi.mock('../helpers/sanitizers', () => ({
  isCustomDomainNotAvailable: vi.fn(),
  isPublicIdNotAvailable: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sanitizeGroups: vi.fn(() => (groups: any) => groups),
  sanitizeSettings: vi.fn((s) => s),
  sanitizeVariables: vi.fn(() => []),
}))
vi.mock('@/features/workspace/helpers/getUserRoleInWorkspace', () => ({
  getUserRoleInWorkspace: vi.fn(),
}))

describe('createTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }
  const mockWorkspace = {
    id: 'ws-1',
    members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    plan: Plan.FREE,
  }

  const validCreatedTypebot = (overrides: Record<string, unknown> = {}) => ({
    version: '6',
    id: 'tb-1',
    workspaceId: mockWorkspace.id,
    name: 'My Bot',
    events: [
      { id: 'event-1', type: 'start', graphCoordinates: { x: 0, y: 0 } },
    ],
    groups: [],
    edges: [],
    variables: [],
    theme: {},
    selectedThemeTemplateId: null,
    settings: { general: { type: 'TOOL' } },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    icon: null,
    folderId: null,
    publicId: null,
    customDomain: null,
    resultsTablePreferences: null,
    isArchived: false,
    isClosed: false,
    isSecondaryFlow: false,
    whatsAppCredentialsId: null,
    riskLevel: null,
    tenant: null,
    toolDescription: null,
    ...overrides,
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

  it('should throw if TOOL is missing tenant', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'My Bot',
          settings: { general: { type: 'TOOL' } },
          toolDescription: 'desc',
          // tenant missing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow('Tenant and Tool description are mandatory')
  })

  it('should throw if TOOL is missing toolDescription', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'My Bot',
          settings: { general: { type: 'TOOL' } },
          tenant: 'ten-1',
          // toolDescription missing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow('Tenant and Tool description are mandatory')
  })

  it('should create TOOL if tenant and toolDescription provided', async () => {
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        tenant: 'ten-1',
        toolDescription: 'desc',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'My Bot',
          settings: { general: { type: 'TOOL' } },
          tenant: 'ten-1',
          toolDescription: 'desc',
        },
      })
    ).resolves.toBeDefined()
  })

  it('should throw if a TOOL name sanitizes to an empty MCP name', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: '!!!',
          settings: { general: { type: 'TOOL' } },
          tenant: 'ten-1',
          toolDescription: 'desc',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow('at least one letter or number')
  })

  it('should throw if a TOOL with a colliding sanitized name exists in the tenant', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'Get Order' } as any,
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'get order',
          settings: { general: { type: 'TOOL' } },
          tenant: 'ten-1',
          toolDescription: 'desc',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow('already exists in this tenant')
  })

  it('should create a TOOL when the same name exists in a different tenant', async () => {
    // findMany is scoped by tenant, so a colliding name in another tenant is
    // simply not returned here.
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([])
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        id: 'tb-3',
        name: 'Get Order',
        tenant: 'ten-2',
        toolDescription: 'desc',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'Get Order',
          settings: { general: { type: 'TOOL' } },
          tenant: 'ten-2',
          toolDescription: 'desc',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()
  })

  it('creates a CONTEXT_ENRICHMENT flow without toolDescription', async () => {
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        id: 'tb-4',
        name: 'Enrichment Flow',
        settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        typebot: {
          name: 'Enrichment Flow',
          settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
        },
      })
    ).resolves.toBeDefined()
  })

  it('seeds the five built-in variables on CONTEXT_ENRICHMENT creation', async () => {
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        id: 'tb-5',
        name: 'Enrichment Flow',
        settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await caller.createTypebot({
      workspaceId: mockWorkspace.id,
      typebot: {
        name: 'Enrichment Flow',
        settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
      },
    })

    const createdVariables = vi.mocked(prisma.typebot.create).mock.calls[0][0]
      .data.variables as { name: string }[]
    expect(createdVariables.map((v) => v.name)).toEqual([
      'helpdeskId',
      'contactName',
      'contactEmail',
      'contactPhone',
      'contactExternalId',
    ])
  })

  it('seeds a detached readonly Declare variables group on CONTEXT_ENRICHMENT creation', async () => {
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await caller.createTypebot({
      workspaceId: mockWorkspace.id,
      typebot: {
        name: 'My Enrichment',
        settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
      },
    })

    const createdData = vi.mocked(prisma.typebot.create).mock.calls[0][0].data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdGroups = createdData.groups as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdVariables = createdData.variables as any[]
    expect(createdGroups).toHaveLength(1)
    expect(createdGroups[0].title).toBe(
      'Variáveis pré-preenchidas pela ClaudIA'
    )
    expect(createdGroups[0].blocks).toHaveLength(1)
    expect(createdGroups[0].blocks[0].type).toBe('Declare variables')
    expect(
      createdGroups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(createdVariables.map((v) => v.id))
    expect(createdData.edges).toEqual([])
  })

  it('does not seed built-in variables on default typebots', async () => {
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        id: 'tb-6',
        name: 'Standard Bot',
        settings: { general: { type: 'default' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await caller.createTypebot({
      workspaceId: mockWorkspace.id,
      typebot: {
        name: 'Standard Bot',
      },
    })

    expect(
      vi.mocked(prisma.typebot.create).mock.calls[0][0].data.variables
    ).toEqual([])
  })

  it('should create normal typebot without tenant/toolDescription', async () => {
    vi.mocked(prisma.typebot.create).mockResolvedValue(
      validCreatedTypebot({
        id: 'tb-2',
        name: 'Standard Bot',
        settings: { general: { type: 'default' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = router({ createTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.createTypebot({
        workspaceId: mockWorkspace.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: {
          name: 'Standard Bot',
        },
      })
    ).resolves.toBeDefined()
  })
})
