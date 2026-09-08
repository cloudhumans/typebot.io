import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { deleteTypebot } from './deleteTypebot'
import { Prisma, WorkspaceRole } from '@typebot.io/prisma'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '../helpers/isWriteTypebotForbidden'
import logger from '@/helpers/logger'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    typebotEditQueue: { deleteMany: vi.fn() },
    bannedIp: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))
vi.mock('../helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))
vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
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

  it('should reject deleting a published CONTEXT_ENRICHMENT flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
      publishedTypebot: { id: 'pub-1' },
    } as never)

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toThrow(
      'Published context enrichment flows cannot be deleted'
    )
  })

  it('should allow deleting a never-published (draft) CONTEXT_ENRICHMENT flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
      publishedTypebot: null,
    } as never)

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
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should take the advisory lock as the first item of the transaction batch', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)

    await caller()({ typebotId: 'tb-1' })

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    const queryRawCallArgs = vi.mocked(prisma.$queryRaw).mock.calls[0]
    const template = queryRawCallArgs[0] as unknown as TemplateStringsArray
    expect(template.join('')).toContain('pg_try_advisory_xact_lock')
    const batch = vi.mocked(prisma.$transaction).mock.calls[0][0]
    expect((batch as unknown as unknown[]).length).toBe(5)
  })

  it('should return CONFLICT when another deletion holds the advisory lock (meta.code)', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Raw query failed. Code: `22012`. Message: `division by zero`',
        {
          code: 'P2010',
          clientVersion: '5.12.1',
          meta: { code: '22012', message: 'division by zero' },
        }
      )
    )

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      'deleteTypebot: concurrent deletion blocked',
      { typebotId: 'tb-1', userId: mockUser.id }
    )
  })

  it('should return CONFLICT when the SQLSTATE only appears in the message', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Raw query failed. Code: `22012`. Message: `division by zero`',
        { code: 'P2010', clientVersion: '5.12.1' }
      )
    )

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('should return NOT_FOUND when the typebot vanished mid-flight', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.12.1',
      })
    )

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should rethrow unrelated transaction errors', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('boom'))

    await expect(caller()({ typebotId: 'tb-1' })).rejects.toThrow('boom')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should rethrow a P2010 with an unrelated SQLSTATE instead of mapping to CONFLICT', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...baseExistingTypebot,
      settings: { general: { type: 'default' } },
      publishedTypebot: null,
    } as never)
    const err = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `55P03`. Message: `lock not available`',
      {
        code: 'P2010',
        clientVersion: '5.12.1',
        meta: { code: '55P03', message: 'lock not available' },
      }
    )
    vi.mocked(prisma.$transaction).mockRejectedValue(err)

    await expect(caller()({ typebotId: 'tb-1' })).rejects.not.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(caller()({ typebotId: 'tb-1' })).rejects.not.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
