import { vi } from 'vitest'

vi.mock('@typebot.io/telemetry/trackEvents', () => ({
  trackEvents: vi.fn(),
}))

vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { trackEvents } from '@typebot.io/telemetry/trackEvents'
import logger from '@/helpers/logger'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'

const trackEventsMock = trackEvents as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as unknown as ReturnType<typeof vi.fn>

const buildPrismaMock = (overrides?: { create?: ReturnType<typeof vi.fn> }) => {
  const create =
    overrides?.create ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.fn(async ({ data }: { data: any }) => ({
      id: 'user-fixture-id',
      email: data.email,
      name: data.name ?? null,
      emailVerified: data.emailVerified ?? null,
      image: data.image ?? null,
      onboardingCategories: data.onboardingCategories ?? [],
      createdAt: new Date('2026-05-06T00:00:00Z'),
      updatedAt: new Date('2026-05-06T00:00:00Z'),
    }))
  return {
    user: { create },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('createCloudChatEmbeddedUser', () => {
  beforeEach(() => {
    trackEventsMock.mockReset()
    trackEventsMock.mockResolvedValue(undefined)
    loggerWarn.mockReset()
  })

  it('creates a User row with email + name + emailVerified + image', async () => {
    const p = buildPrismaMock()
    const verifiedAt = new Date('2026-05-06T00:00:00Z')
    const user = await createCloudChatEmbeddedUser({
      p,
      email: 'maria@cliente.com',
      name: 'Maria Cliente',
      emailVerified: verifiedAt,
      image: null,
    })

    expect(p.user.create).toHaveBeenCalledTimes(1)
    expect(p.user.create).toHaveBeenCalledWith({
      data: {
        email: 'maria@cliente.com',
        name: 'Maria Cliente',
        emailVerified: verifiedAt,
        image: undefined,
        onboardingCategories: [],
      },
    })
    expect(user.email).toBe('maria@cliente.com')
  })

  it('creates a User row with email only when name and emailVerified absent', async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'minimal@local.test' })

    expect(p.user.create).toHaveBeenCalledWith({
      data: {
        email: 'minimal@local.test',
        name: undefined,
        emailVerified: undefined,
        image: undefined,
        onboardingCategories: [],
      },
    })
  })

  it('does not create workspace, MemberInWorkspace or apiToken (no nested relations)', async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'no-side@local.test' })

    const callArg = p.user.create.mock.calls[0][0]
    expect(callArg.data).not.toHaveProperty('apiTokens')
    expect(callArg.data).not.toHaveProperty('workspaces')
    expect(callArg).not.toHaveProperty('include')
  })

  it("fires a single 'User created' telemetry event with email and first-name", async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({
      p,
      email: 'two-words@local.test',
      name: 'João da Silva',
    })

    expect(trackEventsMock).toHaveBeenCalledTimes(1)
    expect(trackEventsMock).toHaveBeenCalledWith([
      {
        name: 'User created',
        userId: 'user-fixture-id',
        data: { email: 'two-words@local.test', name: 'João' },
      },
    ])
  })

  it('emits telemetry with name=undefined when name is null/absent', async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'no-name@local.test' })

    expect(trackEventsMock).toHaveBeenCalledWith([
      {
        name: 'User created',
        userId: 'user-fixture-id',
        data: { email: 'no-name@local.test', name: undefined },
      },
    ])
  })

  it('propagates prisma.user.create errors (does not swallow)', async () => {
    const create = vi.fn(async () => {
      throw new Error('db connection lost')
    })
    const p = buildPrismaMock({ create })

    await expect(
      createCloudChatEmbeddedUser({ p, email: 'boom@local.test' })
    ).rejects.toThrow('db connection lost')
    expect(trackEventsMock).not.toHaveBeenCalled()
  })

  it('swallows trackEvents errors and returns the user (telemetry is best-effort)', async () => {
    trackEventsMock.mockRejectedValueOnce(new Error('telemetry endpoint down'))
    const p = buildPrismaMock()

    const user = await createCloudChatEmbeddedUser({
      p,
      email: 'tele@local.test',
    })

    expect(user.email).toBe('tele@local.test')
    expect(loggerWarn).toHaveBeenCalledWith(
      'cloudchat-embedded telemetry failed (user provisioned)',
      {
        userId: 'user-fixture-id',
        email: 'tele@local.test',
        error: 'telemetry endpoint down',
      }
    )
  })
})
