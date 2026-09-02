import { vi, describe, it, expect, beforeEach } from 'vitest'
import prisma from '@typebot.io/lib/prisma'
import { findPublicTypebot } from './findPublicTypebot'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    publicTypebot: {
      findFirst: vi.fn(),
    },
  },
}))

describe('findPublicTypebot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves by publicId first and does not fall back when it matches', async () => {
    const publicTypebot = { typebotId: 'tb-1' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.publicTypebot.findFirst).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicTypebot as any
    )

    const result = await findPublicTypebot({ publicId: 'my-flow' })

    expect(result).toBe(publicTypebot)
    expect(prisma.publicTypebot.findFirst).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(prisma.publicTypebot.findFirst).mock.calls[0][0]?.where
    ).toEqual({ typebot: { publicId: 'my-flow' } })
  })

  it('falls back to the typebot id when no publicId matches, so CONTEXT_ENRICHMENT flows referenced by id resolve', async () => {
    const publicTypebot = {
      typebotId: 'tb-1',
      settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
    }
    vi.mocked(prisma.publicTypebot.findFirst)
      .mockResolvedValueOnce(null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(publicTypebot as any)

    const result = await findPublicTypebot({ publicId: 'tb-1' })

    expect(result).toBe(publicTypebot)
    expect(prisma.publicTypebot.findFirst).toHaveBeenCalledTimes(2)
    expect(
      vi.mocked(prisma.publicTypebot.findFirst).mock.calls[1][0]?.where
    ).toEqual({ typebotId: 'tb-1' })
  })

  it('does not resolve a published TOOL by typebot id, so tools stay reachable only through their tenant-scoped path', async () => {
    vi.mocked(prisma.publicTypebot.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        typebotId: 'tb-tool',
        settings: { general: { type: 'TOOL' } },
      } as never)

    const result = await findPublicTypebot({ publicId: 'tb-tool' })

    expect(result).toBeNull()
  })

  it('does not resolve a default flow by typebot id', async () => {
    vi.mocked(prisma.publicTypebot.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        typebotId: 'tb-default',
        settings: { general: { type: 'default' } },
      } as never)

    const result = await findPublicTypebot({ publicId: 'tb-default' })

    expect(result).toBeNull()
  })

  it('does not resolve a flow without settings by typebot id', async () => {
    vi.mocked(prisma.publicTypebot.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ typebotId: 'tb-bare', settings: null } as never)

    const result = await findPublicTypebot({ publicId: 'tb-bare' })

    expect(result).toBeNull()
  })

  it('returns null when neither publicId nor typebot id matches', async () => {
    vi.mocked(prisma.publicTypebot.findFirst).mockResolvedValue(null)

    const result = await findPublicTypebot({ publicId: 'missing' })

    expect(result).toBeNull()
  })
})
