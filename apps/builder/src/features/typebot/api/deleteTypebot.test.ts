import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { deleteTypebot } from './deleteTypebot'
import { WorkspaceRole } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    typebotEditQueue: { deleteMany: vi.fn() },
    bannedIp: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))
vi.mock('../helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))

describe('deleteTypebot', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' }

  const baseExistingTypebot = {
    id: 'tb-1',
    workspace: {
      id: 'ws-1',
      name: 'ws',
      isSuspended: false,
      isPastDue: false,
      members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    },
    collaborators: [],
  }

  const caller = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router({ deleteTypebot }).createCaller({ user: mockUser } as never)
      .deleteTypebot

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    vi.mocked(prisma.$transaction).mockResolvedValue([])
  })

  it('should reject deleting a published TOOL', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'TOOL' } },
      publishedTypebot: { id: 'pub-1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toThrow(
      'Published tools cannot be deleted'
    )
  })

  it('should allow deleting a never-published (draft) TOOL', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'TOOL' } },
      publishedTypebot: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(caller()({ typebotId: 'tb-1' })).resolves.toEqual({
      message: 'success',
    })
  })

  it('should allow deleting a published non-TOOL flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: { id: 'pub-1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(caller()({ typebotId: 'tb-1' })).resolves.toEqual({
      message: 'success',
    })
  })
})
