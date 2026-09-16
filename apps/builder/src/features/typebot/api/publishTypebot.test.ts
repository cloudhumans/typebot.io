import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { publishTypebot } from './publishTypebot'
import { WorkspaceRole, Plan } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'
import { computeRiskLevel } from '@typebot.io/radar'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    publicTypebot: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    typebotHistory: {
      create: vi.fn(),
    },
  },
}))
vi.mock('../helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))
vi.mock('../helpers/sanitizers', () => ({
  isPublicIdNotAvailable: vi.fn(() => false),
}))
vi.mock('@/features/telemetry/helpers/parseTypebotPublishEvents', () => ({
  parseTypebotPublishEvents: vi.fn(async () => []),
}))
vi.mock('@typebot.io/telemetry/trackEvents', () => ({
  trackEvents: vi.fn(),
}))
vi.mock('@typebot.io/radar', () => ({
  computeRiskLevel: vi.fn(() => 0),
}))
vi.mock('@/helpers/generateHistoryChecksum', () => ({
  generateHistoryChecksum: vi.fn(() => 'checksum'),
}))

describe('publishTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }

  const groups = [
    {
      id: 'grp_a',
      title: 'A',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: 'blk_a',
          type: 'text',
          content: { richText: [] },
          outgoingEdgeId: 'e_a_b',
        },
      ],
    },
    {
      id: 'grp_b',
      title: 'B',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [{ id: 'blk_b', type: 'text', content: { richText: [] } }],
    },
  ]
  const edges = [
    { id: 'e_start', from: { eventId: 'ev' }, to: { groupId: 'grp_a' } },
    { id: 'e_a_b', from: { blockId: 'blk_a' }, to: { groupId: 'grp_b' } },
  ]
  const events = [
    {
      id: 'ev',
      type: 'start',
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: 'e_start',
    },
  ]

  const existingTypebot = (overrides: Record<string, unknown> = {}) => ({
    id: 'tb-1',
    version: '6',
    name: 'Flow',
    icon: null,
    folderId: null,
    groups,
    edges,
    events,
    variables: [],
    theme: {},
    settings: {},
    selectedThemeTemplateId: null,
    resultsTablePreferences: null,
    publicId: 'flow',
    customDomain: null,
    workspaceId: 'ws-1',
    isArchived: false,
    isClosed: false,
    riskLevel: -1,
    whatsAppCredentialsId: null,
    isSecondaryFlow: false,
    collaborators: [],
    publishedTypebot: null,
    workspace: {
      id: 'ws-1',
      name: 'ws',
      plan: Plan.PRO,
      isVerified: true,
      isSuspended: false,
      isPastDue: false,
      members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    },
    ...overrides,
  })

  const caller = () =>
    router({ publishTypebot }).createCaller({ user: mockUser } as never)
      .publishTypebot

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    vi.mocked(computeRiskLevel).mockReturnValue(0)
  })

  it('publishes a consistent draft', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingTypebot() as any
    )

    await expect(caller()({ typebotId: 'tb-1' })).resolves.toEqual({
      message: 'success',
    })
    expect(prisma.publicTypebot.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.typebotHistory.create).toHaveBeenCalledTimes(1)
  })

  it('publishes a draft whose only orphans are stale outgoingEdgeIds', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(
      existingTypebot({
        groups: [
          {
            ...groups[0],
            blocks: [{ ...groups[0].blocks[0], outgoingEdgeId: 'e_gone' }],
          },
          groups[1],
        ],
        edges: [edges[0]],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    await expect(caller()({ typebotId: 'tb-1' })).resolves.toEqual({
      message: 'success',
    })
    expect(prisma.publicTypebot.createMany).toHaveBeenCalledTimes(1)
  })

  it('still takes down the published version of a high-risk draft before refusing it for broken references', async () => {
    vi.mocked(computeRiskLevel).mockReturnValue(100)
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(
      existingTypebot({
        groups: [groups[1]],
        riskLevel: null,
        publishedTypebot: { id: 'pub-1' },
        workspace: {
          ...existingTypebot().workspace,
          isVerified: false,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toThrow(
      /Radar detected/
    )
    expect(prisma.publicTypebot.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pub-1' },
    })
    expect(prisma.typebotHistory.create).not.toHaveBeenCalled()
  })

  it('refuses to publish a draft whose edges point at missing groups', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingTypebot({ groups: [groups[1]] }) as any
    )

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toThrow(
      /Cannot publish: the draft is inconsistent/
    )
    expect(prisma.publicTypebot.createMany).not.toHaveBeenCalled()
    expect(prisma.publicTypebot.updateMany).not.toHaveBeenCalled()
    expect(prisma.typebotHistory.create).not.toHaveBeenCalled()
  })
})
