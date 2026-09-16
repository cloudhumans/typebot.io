import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { updateTypebot } from './updateTypebot'
import { WorkspaceRole, Plan } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('../helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))
vi.mock('@/helpers/isCloudProdInstance', () => ({
  isCloudProdInstance: vi.fn(() => false),
}))
vi.mock('@typebot.io/migrations/migrateTypebot', () => ({
  migrateTypebot: vi.fn((t) => t),
}))
vi.mock('../helpers/sanitizers', () => ({
  isCustomDomainNotAvailable: vi.fn(() => false),
  isPublicIdNotAvailable: vi.fn(() => false),
  sanitizeCustomDomain: vi.fn(() => undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sanitizeGroups: vi.fn(() => (groups: any) => groups),
  sanitizeSettings: vi.fn((s) => s),
  sanitizeVariables: vi.fn(() => []),
}))
vi.mock('@typebot.io/schemas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@typebot.io/schemas')>()
  return {
    ...actual,
    typebotSchema: { parse: (t: unknown) => t },
  }
})

describe('updateTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }

  const baseExistingTypebot = {
    id: 'tb-1',
    name: 'My Tool',
    version: '6',
    customDomain: null,
    publicId: null,
    updatedAt: new Date('2020-01-01'),
    workspace: {
      id: 'ws-1',
      name: 'ws',
      plan: Plan.FREE,
      isSuspended: false,
      isPastDue: false,
      members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    },
    collaborators: [],
  }

  const asTool = { settings: { general: { type: 'TOOL' } } }
  const asFlow = { settings: { general: { type: 'default' } } }

  const asEnrichment = {
    settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
  }

  const allBuiltInVariables = [
    { id: 'v1', name: 'helpdeskId' },
    { id: 'v2', name: 'contactName' },
    { id: 'v3', name: 'contactEmail' },
    { id: 'v4', name: 'contactPhone' },
    { id: 'v5', name: 'contactExternalId' },
  ]

  const validUpdatedTypebot = {
    version: '6',
    id: 'tb-1',
    workspaceId: 'ws-1',
    name: 'My Tool',
    events: [
      { id: 'event-1', type: 'start', graphCoordinates: { x: 0, y: 0 } },
    ],
    groups: [],
    edges: [],
    variables: [],
    theme: {},
    selectedThemeTemplateId: null,
    settings: { general: { type: 'TOOL' } },
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    let lastWrittenData: Record<string, unknown> = {}
    vi.mocked(prisma.typebot.updateMany).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async ({ data }: any) => {
        lastWrittenData = data
        return { count: 1 }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )
    vi.mocked(prisma.typebot.findUnique).mockImplementation((async () => ({
      ...validUpdatedTypebot,
      ...Object.fromEntries(
        Object.entries(lastWrittenData).filter(
          ([, value]) => value !== undefined
        )
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any)
  })

  const caller = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router({ updateTypebot }).createCaller({ user: mockUser } as never)
      .updateTypebot

  const textBlock = (id: string, outgoingEdgeId?: string) => ({
    id,
    type: 'text',
    content: { richText: [] },
    outgoingEdgeId,
  })
  const flowGroup = (id: string, blocks: ReturnType<typeof textBlock>[]) => ({
    id,
    title: id,
    graphCoordinates: { x: 0, y: 0 },
    blocks,
  })
  const storedFlow = () => ({
    events: [
      {
        id: 'ev_start',
        type: 'start',
        graphCoordinates: { x: 0, y: 0 },
        outgoingEdgeId: 'e_start_a',
      },
    ],
    groups: [
      flowGroup('grp_a', [textBlock('blk_a', 'e_a_b')]),
      flowGroup('grp_b', [textBlock('blk_b', 'e_b_c')]),
      flowGroup('grp_c', [textBlock('blk_c', 'e_c_d')]),
      flowGroup('grp_d', [textBlock('blk_d')]),
    ],
    edges: [
      {
        id: 'e_start_a',
        from: { eventId: 'ev_start' },
        to: { groupId: 'grp_a' },
      },
      {
        id: 'e_a_b',
        from: { blockId: 'blk_a' },
        to: { groupId: 'grp_b', blockId: 'blk_b' },
      },
      { id: 'e_b_c', from: { blockId: 'blk_b' }, to: { groupId: 'grp_c' } },
      {
        id: 'e_c_d',
        from: { blockId: 'blk_c' },
        to: { groupId: 'grp_d', blockId: 'blk_d' },
      },
    ],
  })
  const mockStoredFlow = (flow = storedFlow()) =>
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      ...flow,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  const savedData = () =>
    vi.mocked(prisma.typebot.updateMany).mock.calls[0][0].data

  it('rejects a partial groups array (the GAD payload) with a message about removed groups, without writing', async () => {
    mockStoredFlow()
    const flow = storedFlow()

    let message = ''
    try {
      await caller()({
        typebotId: 'tb-1',
        typebot: {
          updatedAt: new Date('2026-01-01'),
          groups: [{ ...flow.groups[1], title: 'Grupo B (editado)' }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain(
      "This update would replace the flow's 4 groups with 1, removing grp_a, grp_c, grp_d"
    )
    expect(message).toContain('replaced wholesale')
    expect(message).toContain('Do not delete edges')
    expect(message).not.toMatch(/edge e_/)
    expect(prisma.typebot.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a partial groups array even when the orphan edges have no to.blockId', async () => {
    const flow = storedFlow()
    flow.edges = flow.edges.map((edge) => ({
      ...edge,
      to: { groupId: edge.to.groupId },
    }))
    mockStoredFlow(flow)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: [flow.groups[1]] } as any,
      })
    ).rejects.toThrow(/removing grp_a, grp_c, grp_d/)
    expect(prisma.typebot.updateMany).not.toHaveBeenCalled()
  })

  it('rejects removing a source group while keeping the edges that left it', async () => {
    mockStoredFlow()
    const flow = storedFlow()

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: flow.groups.slice(1),
          edges: flow.edges,
          events: flow.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow(/removing grp_a/)
  })

  it('rejects partial groups sent together with partial edges', async () => {
    mockStoredFlow()
    const flow = storedFlow()

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: [flow.groups[1]],
          edges: [flow.edges[1]],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow(/removing grp_a, grp_c, grp_d/)
  })

  it('rejects edges pointing at a block that is not in the target group', async () => {
    mockStoredFlow()
    const flow = storedFlow()
    flow.edges[1].to = { groupId: 'grp_b', blockId: 'blk_gone' }

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { edges: flow.edges } as any,
      })
    ).rejects.toThrow(/would leave 1 references/)
  })

  it('rejects outgoingEdgeIds (event, block, item) that point at edges the payload drops', async () => {
    mockStoredFlow()
    const flow = storedFlow()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(flow.groups[3].blocks as any[]).push({
      id: 'blk_choice',
      type: 'choice input',
      items: [{ id: 'item_1', outgoingEdgeId: 'e_item' }],
    })

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: flow.groups, edges: [] } as any,
      })
    ).rejects.toThrow(/would leave 4 references/)
  })

  it('accepts the complete arrays read from getTypebot with one group edited', async () => {
    mockStoredFlow()
    const flow = storedFlow()
    flow.groups[1].title = 'Grupo B (editado)'

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          updatedAt: new Date('2026-01-01'),
          groups: flow.groups,
          edges: flow.edges,
          events: flow.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()
    expect(savedData().groups).toHaveLength(4)
  })

  it('accepts the complete groups array with edges and events omitted (they keep their stored value)', async () => {
    mockStoredFlow()
    const flow = storedFlow()
    flow.groups[1].title = 'Grupo B (editado)'

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: flow.groups } as any,
      })
    ).resolves.toBeDefined()
    expect(savedData().edges).toBeUndefined()
  })

  it('accepts a deliberate group removal when its edges and outgoingEdgeIds go with it (what the builder UI sends)', async () => {
    mockStoredFlow()
    const flow = storedFlow()

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: [
            flow.groups[0],
            flowGroup('grp_b', [textBlock('blk_b')]),
            flow.groups[3],
          ],
          edges: [flow.edges[0], flow.edges[1]],
          events: flow.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()
    expect(savedData().groups).toHaveLength(3)
  })

  it('accepts an update that leaves a legacy dangling edge untouched', async () => {
    const flow = storedFlow()
    flow.edges.push({
      id: 'e_legacy',
      from: { blockId: 'blk_gone' },
      to: { groupId: 'grp_gone' },
    })
    mockStoredFlow(flow)
    flow.groups[1].title = 'renamed'

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: flow.groups,
          edges: flow.edges,
          events: flow.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()
  })

  it('cleans pre-existing stale outgoingEdgeIds and sourceless edges on write once the delta passes', async () => {
    const flow = storedFlow()
    flow.groups[3].blocks[0].outgoingEdgeId = 'e_legacy_gone'
    flow.edges.push({
      id: 'e_legacy',
      from: { blockId: 'blk_gone' },
      to: { groupId: 'grp_a' },
    })
    mockStoredFlow(flow)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: flow.groups } as any,
      })
    ).resolves.toBeDefined()

    const data = savedData()
    const savedGroups = data.groups as {
      id: string
      blocks: { outgoingEdgeId?: string }[]
    }[]
    expect(
      savedGroups.find((g) => g.id === 'grp_d')?.blocks[0]
    ).not.toHaveProperty('outgoingEdgeId')
    expect((data.edges as { id: string }[]).map((e) => e.id)).toEqual([
      'e_start_a',
      'e_a_b',
      'e_b_c',
      'e_c_d',
    ])
    expect(data.events).toBeUndefined()
  })

  it('accepts a client copy that still carries a stale outgoingEdgeId after the stored flow was cleaned, and cleans it again', async () => {
    mockStoredFlow()
    const stale = storedFlow()
    stale.groups[3].blocks[0].outgoingEdgeId = 'e_legacy_gone'
    stale.groups[1].title = 'edited twice'

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: stale.groups,
          edges: stale.edges,
          events: stale.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()

    const savedGroups = savedData().groups as {
      id: string
      title: string
      blocks: { outgoingEdgeId?: string }[]
    }[]
    expect(savedGroups.find((g) => g.id === 'grp_b')?.title).toBe(
      'edited twice'
    )
    expect(
      savedGroups.find((g) => g.id === 'grp_d')?.blocks[0]
    ).not.toHaveProperty('outgoingEdgeId')
  })

  it('still rejects a payload that drops an edge the stored flow has while its source keeps pointing at it', async () => {
    mockStoredFlow()
    const flow = storedFlow()

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: flow.groups,
          edges: flow.edges.filter((e) => e.id !== 'e_b_c'),
          events: flow.events,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).rejects.toThrow(/would leave 1 references/)
    expect(prisma.typebot.updateMany).not.toHaveBeenCalled()
  })

  it('skips the integrity check when the payload carries no groups, edges or events (dashboard rename/move)', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asFlow,
      groups: [flowGroup('grp_only', [])],
      edges: [
        {
          id: 'e_legacy',
          from: { blockId: 'blk_gone' },
          to: { groupId: 'grp_gone' },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { name: 'Moved', folderId: 'folder-1' } as any,
      })
    ).resolves.toBeDefined()
    expect(savedData().folderId).toBe('folder-1')
  })

  it('writes conditionally on the updatedAt it read and answers 409 when the row moved on', async () => {
    mockStoredFlow()
    const flow = storedFlow()
    vi.mocked(prisma.typebot.updateMany).mockResolvedValue({ count: 0 })

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: flow.groups } as any,
      })
    ).rejects.toThrow(/changed since you read it/)
    expect(vi.mocked(prisma.typebot.updateMany).mock.calls[0][0].where).toEqual(
      { id: 'tb-1', updatedAt: baseExistingTypebot.updatedAt }
    )
    expect(prisma.typebot.findUnique).not.toHaveBeenCalled()
  })

  it('normalizes a CONTEXT_ENRICHMENT groups-only payload against the stored edges and saves both consistently', async () => {
    const declareBlock = (id: string, outgoingEdgeId?: string) => ({
      id,
      type: 'Declare variables',
      options: { variables: [] },
      outgoingEdgeId,
    })
    const carrier = {
      id: 'g_declare',
      title: 'Variáveis pré-preenchidas pela ClaudIA',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [declareBlock('b_declare', 'e_declare_out')],
    }
    const extraDeclareOnly = {
      id: 'g_extra',
      title: 'extra',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [declareBlock('b_extra')],
    }
    const output = flowGroup('g_out', [textBlock('b_out', 'e_to_extra')])
    const storedEdges = [
      {
        id: 'e_declare_out',
        from: { blockId: 'b_declare' },
        to: { groupId: 'g_out' },
      },
      {
        id: 'e_to_extra',
        from: { blockId: 'b_out' },
        to: { groupId: 'g_extra' },
      },
    ]
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      variables: allBuiltInVariables,
      groups: [carrier, extraDeclareOnly, output],
      edges: storedEdges,
      events: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          groups: [
            carrier,
            extraDeclareOnly,
            { ...output, title: 'saída editada' },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()

    const data = savedData()
    expect((data.groups as { id: string }[]).map((g) => g.id)).toEqual([
      'g_declare',
      'g_out',
    ])
    expect((data.edges as { id: string }[]).map((e) => e.id)).toEqual([
      'e_declare_out',
    ])
    const savedOutput = (
      data.groups as { id: string; blocks: { outgoingEdgeId?: string }[] }[]
    ).find((g) => g.id === 'g_out')
    expect(savedOutput?.blocks[0].outgoingEdgeId).toBeUndefined()
  })

  it('rejects a CONTEXT_ENRICHMENT payload that sends groups with an empty edges array, like any other flow', async () => {
    const carrier = {
      id: 'g_declare',
      title: 'Variáveis pré-preenchidas pela ClaudIA',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: 'b_declare',
          type: 'Declare variables',
          options: { variables: [] },
          outgoingEdgeId: 'e_declare_out',
        },
      ],
    }
    const output = flowGroup('g_out', [textBlock('b_out')])
    const storedEdges = [
      {
        id: 'e_declare_out',
        from: { blockId: 'b_declare' },
        to: { groupId: 'g_out' },
      },
    ]
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      variables: allBuiltInVariables,
      groups: [carrier, output],
      edges: storedEdges,
      events: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { groups: [carrier, output], edges: [] } as any,
      })
    ).rejects.toThrow(/would leave 1 references/)
    expect(prisma.typebot.updateMany).not.toHaveBeenCalled()
  })

  it('should reject renaming a TOOL', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { name: 'Renamed Tool' } as any,
      })
    ).rejects.toThrow('Tool name is immutable')
  })

  it('should reject renaming a TOOL even when payload omits settings', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { name: 'Renamed Tool' } as any,
      })
    ).rejects.toThrow('Tool name is immutable')
  })

  it('should reject archiving a TOOL', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { isArchived: true } as any,
      })
    ).rejects.toThrow('Tools cannot be archived')
  })

  it('should allow editing a TOOL toolDescription (identity untouched)', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { toolDescription: 'updated description' } as any,
      })
    ).resolves.toBeDefined()
  })

  it('should allow passing the same name for a TOOL (no-op rename)', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asTool,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { name: 'My Tool' } as any,
      })
    ).resolves.toBeDefined()
  })

  it('should allow renaming a non-TOOL flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asFlow,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { name: 'Renamed Flow' } as any,
      })
    ).resolves.toBeDefined()
  })

  it('re-seeds missing built-in variables on a CONTEXT_ENRICHMENT update instead of rejecting', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          variables: allBuiltInVariables.slice(0, 4),
          groups: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()

    const { sanitizeVariables } = await import('../helpers/sanitizers')
    const savedVariables =
      vi.mocked(sanitizeVariables).mock.calls[0][0].variables
    const savedNames = savedVariables.map((v: { name: string }) => v.name)
    expect(savedNames).toEqual(
      expect.arrayContaining([
        'helpdeskId',
        'contactName',
        'contactEmail',
        'contactPhone',
        'contactExternalId',
      ])
    )
  })

  it('keeps stale pre-revision variables as plain variables while re-seeding the current built-ins', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          variables: [
            { id: 'v-old-1', name: 'contactId' },
            { id: 'v-old-2', name: 'contactAttributes' },
          ],
          groups: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()

    const { sanitizeVariables } = await import('../helpers/sanitizers')
    const savedVariables =
      vi.mocked(sanitizeVariables).mock.calls[0][0].variables
    const savedNames = savedVariables.map((v: { name: string }) => v.name)
    expect(savedNames).toEqual(
      expect.arrayContaining([
        'helpdeskId',
        'contactName',
        'contactEmail',
        'contactPhone',
        'contactExternalId',
        'contactId',
        'contactAttributes',
      ])
    )
  })

  it('rejects a settings payload that drops the CONTEXT_ENRICHMENT type', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { settings: { general: { type: 'TOOL' } } } as any,
      })
    ).rejects.toThrow(/cannot change type/)
  })

  it('rejects a settings payload that omits the type, because settings are replaced wholesale and the omission would drop CONTEXT_ENRICHMENT', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typebot: { settings: { general: { isBrandingEnabled: false } } } as any,
      })
    ).rejects.toThrow(/cannot change type/)
  })

  it('seeds a detached readonly Declare variables group on a CONTEXT_ENRICHMENT update without one', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await caller()({
      typebotId: 'tb-1',
      typebot: {
        variables: allBuiltInVariables,
        groups: [],
        edges: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })

    const savedGroups =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.typebot.updateMany).mock.calls[0][0].data.groups as any[]
    expect(savedGroups).toHaveLength(1)
    expect(savedGroups[0].title).toBe('Variáveis pré-preenchidas pela ClaudIA')
    expect(savedGroups[0].blocks).toHaveLength(1)
    expect(savedGroups[0].blocks[0].type).toBe('Declare variables')
    expect(
      savedGroups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
  })

  it('rewrites a tampered Declare variables block to the canonical built-ins and keeps it wired', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      events: [
        { id: 'start', type: 'start', graphCoordinates: { x: 0, y: 0 } },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await caller()({
      typebotId: 'tb-1',
      typebot: {
        variables: allBuiltInVariables,
        groups: [
          {
            id: 'g1',
            title: 'Variáveis pré-preenchidas pela ClaudIA',
            graphCoordinates: { x: 0, y: 0 },
            blocks: [
              {
                id: 'b1',
                type: 'Declare variables',
                options: {
                  variables: [
                    {
                      variableId: 'v-injected',
                      description: 'injected',
                      required: false,
                    },
                  ],
                },
              },
            ],
          },
        ],
        edges: [
          {
            id: 'e1',
            from: { eventId: 'start' },
            to: { groupId: 'g1' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })

    const savedData = vi.mocked(prisma.typebot.updateMany).mock.calls[0][0].data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedGroups = savedData.groups as any[]
    expect(savedGroups).toHaveLength(1)
    expect(savedGroups[0].blocks[0].id).toBe('b1')
    expect(
      savedGroups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(savedData.edges).toEqual([
      { id: 'e1', from: { eventId: 'start' }, to: { groupId: 'g1' } },
    ])
  })

  it('rejects converting an existing flow into CONTEXT_ENRICHMENT', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asFlow,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const caller = router({ updateTypebot }).createCaller({
      user: mockUser,
    } as never)

    await expect(
      caller.updateTypebot({
        typebotId: 'tb-1',
        typebot: {
          settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
        },
      })
    ).rejects.toThrow(/cannot be converted to context enrichment/)
  })

  it('accepts a valid CONTEXT_ENRICHMENT snapshot including a rename', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      ...asEnrichment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(
      caller()({
        typebotId: 'tb-1',
        typebot: {
          name: 'Renamed Enrichment',
          settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
          variables: [...allBuiltInVariables, { id: 'v6', name: 'custom' }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ).resolves.toBeDefined()
  })
})
