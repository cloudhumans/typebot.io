import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { rollbackTypebot } from './rollbackTypebot'
import { WorkspaceRole, Plan } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    typebotHistory: {
      findFirst: vi.fn(),
    },
  },
}))
vi.mock('../helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))

describe('rollbackTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }

  const existingTypebot = {
    id: 'tb-1',
    collaborators: [],
    workspace: {
      id: 'ws-1',
      name: 'ws',
      plan: Plan.PRO,
      isSuspended: false,
      isPastDue: false,
      members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    },
  }

  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    id: 'hist-1',
    typebotId: 'tb-1',
    name: 'Flow',
    icon: null,
    groups: [
      {
        id: 'grp_a',
        title: 'A',
        graphCoordinates: { x: 0, y: 0 },
        blocks: [{ id: 'blk_a', type: 'text', content: { richText: [] } }],
      },
    ],
    events: [
      {
        id: 'ev',
        type: 'start',
        graphCoordinates: { x: 0, y: 0 },
        outgoingEdgeId: 'e_start',
      },
    ],
    edges: [
      { id: 'e_start', from: { eventId: 'ev' }, to: { groupId: 'grp_a' } },
    ],
    variables: [],
    theme: {},
    settings: {},
    selectedThemeTemplateId: null,
    resultsTablePreferences: null,
    publicId: null,
    customDomain: null,
    isArchived: false,
    isClosed: false,
    riskLevel: null,
    whatsAppCredentialsId: null,
    ...overrides,
  })

  const caller = () =>
    router({ rollbackTypebot }).createCaller({ user: mockUser } as never)
      .rollbackTypebot

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingTypebot as any
    )
  })

  it('restores a consistent snapshot into the draft', async () => {
    vi.mocked(prisma.typebotHistory.findFirst).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot() as any
    )

    await expect(
      caller()({ typebotId: 'tb-1', historyId: 'hist-1' })
    ).resolves.toMatchObject({ historyId: 'hist-1' })
    expect(prisma.typebot.update).toHaveBeenCalledTimes(1)
  })

  it('refuses a snapshot whose edges point at missing groups', async () => {
    vi.mocked(prisma.typebotHistory.findFirst).mockResolvedValue(
      snapshot({
        edges: [
          { id: 'e_start', from: { eventId: 'ev' }, to: { groupId: 'grp_a' } },
          {
            id: 'e_gone',
            from: { blockId: 'blk_gone' },
            to: { groupId: 'grp_gone', blockId: 'blk_other' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    await expect(
      caller()({ typebotId: 'tb-1', historyId: 'hist-1' })
    ).rejects.toThrow(/Cannot roll back to this snapshot/)
    expect(prisma.typebot.update).not.toHaveBeenCalled()
  })
})
