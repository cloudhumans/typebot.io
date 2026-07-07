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
      update: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    vi.mocked(prisma.typebot.update).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async ({ data }: any) => ({ id: 'tb-1', ...data })) as any
    )
  })

  const caller = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router({ updateTypebot }).createCaller({ user: mockUser } as never)
      .updateTypebot

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
})
