import { vi } from 'vitest'

vi.mock('@typebot.io/env', () => ({
  env: {
    COGNITO_ISSUER_URL: 'https://cognito.test/issuer',
    CLOUDCHAT_COGNITO_APP_CLIENT_ID: 'test-client-id',
  },
}))

vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/auth/helpers/verifyCognitoToken', () => ({
  verifyCognitoToken: vi.fn(),
}))

vi.mock('./createCloudChatEmbeddedUser', () => ({
  createCloudChatEmbeddedUser: vi.fn(),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import logger from '@/helpers/logger'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'
import { cloudchatEmbeddedAuthorize } from './cloudchatEmbeddedAuthorize'

const verifyMock = verifyCognitoToken as ReturnType<typeof vi.fn>
const createMock = createCloudChatEmbeddedUser as ReturnType<typeof vi.fn>
const loggerInfo = logger.info as unknown as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as unknown as ReturnType<typeof vi.fn>
const loggerError = logger.error as unknown as ReturnType<typeof vi.fn>

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
}

describe('cloudchatEmbeddedAuthorize', () => {
  beforeEach(() => {
    verifyMock.mockReset()
    createMock.mockReset()
    loggerInfo.mockReset()
    loggerWarn.mockReset()
    loggerError.mockReset()
  })

  it('returns null when credentials.token is missing', async () => {
    const p = buildPrismaMock()
    const result = await cloudchatEmbeddedAuthorize(p, undefined)
    expect(result).toBeNull()
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('returns null and logs error when verifyCognitoToken throws', async () => {
    verifyMock.mockRejectedValueOnce(new Error('bad signature'))
    const p = buildPrismaMock()

    const result = await cloudchatEmbeddedAuthorize(p, { token: 'bad' })

    expect(result).toBeNull()
    expect(loggerError).toHaveBeenCalledWith(
      'Error in cloudchat-embedded authorize',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('returns null and logs warn when payload has no email', async () => {
    verifyMock.mockResolvedValueOnce({ sub: 'sub-x', 'cognito:username': 'u' })
    const p = buildPrismaMock()

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith(
      'cloudchat-embedded payload missing email',
      { sub: 'sub-x', cognitoUsername: 'u' }
    )
    expect(p.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns existing user when findUnique hits (does not call createCloudChatEmbeddedUser)', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'jit@local.test' },
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'jit@local.test',
      cloudChatAuthorization: true,
    })
  })

  it("creates user via createCloudChatEmbeddedUser and logs info 'JIT-provisioned'", async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockResolvedValueOnce(userFixture)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

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
    expect(result).not.toBeNull()
  })

  it("on P2002: refetches and returns user, logs info 'race resolved'", async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
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

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(findUnique).toHaveBeenCalledTimes(2)
    expect(loggerInfo).toHaveBeenCalledWith(
      'cloudchat-embedded JIT race resolved',
      { email: 'jit@local.test' }
    )
    expect(result).toMatchObject({ id: 'user-1' })
  })

  it('on P2002 + refetch returns null: rethrows (caught by outer, returns null + error log)', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
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

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerError).toHaveBeenCalledWith(
      'Error in cloudchat-embedded authorize',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('on non-P2002 error: logs warn JIT refused + returns null', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockRejectedValueOnce(new Error('db: connection lost'))

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith('cloudchat-embedded JIT refused', {
      email: 'jit@local.test',
      reason: 'db: connection lost',
    })
    expect(loggerError).not.toHaveBeenCalled()
  })

  it('returns full DatabaseUserWithCognito shape with cloudChatAuthorization=true and cognitoTokenExp', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toEqual({
      id: 'user-1',
      email: 'jit@local.test',
      name: 'JIT',
      image: null,
      emailVerified: userFixture.emailVerified,
      createdAt: userFixture.createdAt,
      cognitoClaims: {
        'custom:hub_role': 'CLIENT',
        'custom:eddie_workspaces': 'ws-a,ws-b',
      },
      cloudChatAuthorization: true,
      cognitoTokenExp: 9999999999,
    })
  })

  it("forwards user.createdAt so signIn callback's isNewUser check works for returning users", async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result?.createdAt).toEqual(userFixture.createdAt)
  })

  it('maps email_verified=true to emailVerified Date; false/undefined to null', async () => {
    verifyMock.mockResolvedValueOnce({ ...basePayload, email_verified: true })
    const p1 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p1, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: expect.any(Date) })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'a@b',
      email_verified: false,
    })
    const p2 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p2, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: null })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'c@d',
      email_verified: undefined,
    })
    const p3 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p3, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: null })
    )
  })

  it("counts eddie_workspaces correctly: 'ws-a,ws-b' = 2; '' = 0; '*' = 1", async () => {
    const findUnique = vi.fn(async () => null)

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      'custom:eddie_workspaces': 'ws-a,ws-b',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), {
      token: 't',
    })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 2 })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'b@b',
      'custom:eddie_workspaces': '',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), {
      token: 't',
    })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 0 })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'c@c',
      'custom:eddie_workspaces': '*',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), {
      token: 't',
    })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 1 })
    )
  })
})
