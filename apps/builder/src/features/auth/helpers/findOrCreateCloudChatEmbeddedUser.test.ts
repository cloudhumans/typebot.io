import { vi } from 'vitest'

vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./createCloudChatEmbeddedUser', () => ({
  createCloudChatEmbeddedUser: vi.fn(),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import logger from '@/helpers/logger'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'
import { findOrCreateCloudChatEmbeddedUser } from './findOrCreateCloudChatEmbeddedUser'

const createMock = createCloudChatEmbeddedUser as ReturnType<typeof vi.fn>
const loggerInfo = logger.info as unknown as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as unknown as ReturnType<typeof vi.fn>

const userFixture = {
  id: 'user-1',
  email: 'jit@local.test',
  name: 'JIT',
  image: null,
  emailVerified: new Date('2026-05-06T00:00:00Z'),
  createdAt: new Date('2026-05-05T12:00:00Z'),
}

const buildPrismaMock = (
  findUniqueImpl?: ReturnType<typeof vi.fn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  user: {
    findUnique: findUniqueImpl ?? vi.fn(async () => null),
  },
})

const basePayload = {
  email: 'jit@local.test',
  email_verified: true,
  name: 'JIT',
  'custom:hub_role': 'CLIENT',
  'custom:eddie_workspaces': 'ws-a,ws-b',
  sub: 'sub-1',
  exp: 9999999999,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('findOrCreateCloudChatEmbeddedUser', () => {
  beforeEach(() => {
    createMock.mockReset()
    loggerInfo.mockReset()
    loggerWarn.mockReset()
  })

  it('returns null and logs warn when payload has no email', async () => {
    const p = buildPrismaMock()

    const result = await findOrCreateCloudChatEmbeddedUser(p, {
      sub: 'sub-x',
      'cognito:username': 'u',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith(
      'cloudchat-embedded payload missing email',
      { sub: 'sub-x', cognitoUsername: 'u' }
    )
    expect(p.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns existing user without calling createCloudChatEmbeddedUser', async () => {
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await findOrCreateCloudChatEmbeddedUser(p, basePayload)

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'jit@local.test' },
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(result).toBe(userFixture)
  })

  it("creates user when absent and logs info 'JIT-provisioned'", async () => {
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockResolvedValueOnce(userFixture)

    const result = await findOrCreateCloudChatEmbeddedUser(p, basePayload)

    expect(createMock).toHaveBeenCalledWith({
      p,
      email: 'jit@local.test',
      name: 'JIT',
      emailVerified: expect.any(Date),
    })
    expect(loggerInfo).toHaveBeenCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      {
        userId: 'user-1',
        email: 'jit@local.test',
        hubRole: 'CLIENT',
        eddieWorkspacesCount: 2,
      }
    )
    expect(result).toBe(userFixture)
  })

  it("on P2002: refetches and returns user, logs info 'race resolved'", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(userFixture)
    const p = buildPrismaMock(findUnique)
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    createMock.mockRejectedValueOnce(p2002)

    const result = await findOrCreateCloudChatEmbeddedUser(p, basePayload)

    expect(findUnique).toHaveBeenCalledTimes(2)
    expect(loggerInfo).toHaveBeenCalledWith(
      'cloudchat-embedded JIT race resolved',
      { email: 'jit@local.test' }
    )
    expect(result).toBe(userFixture)
  })

  it('on P2002 + refetch returns null: rethrows', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    const p = buildPrismaMock(findUnique)
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    createMock.mockRejectedValueOnce(p2002)

    await expect(
      findOrCreateCloudChatEmbeddedUser(p, basePayload)
    ).rejects.toBe(p2002)
  })

  it('on non-P2002 error: logs warn JIT refused and returns null', async () => {
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockRejectedValueOnce(new Error('db: connection lost'))

    const result = await findOrCreateCloudChatEmbeddedUser(p, basePayload)

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith('cloudchat-embedded JIT refused', {
      email: 'jit@local.test',
      reason: 'db: connection lost',
    })
  })
})
