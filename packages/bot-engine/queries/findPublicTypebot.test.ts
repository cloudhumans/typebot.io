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

  it('falls back to the typebot id when no publicId matches, so flows referenced by id (context enrichment) resolve', async () => {
    const publicTypebot = { typebotId: 'tb-1' }
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

  it('returns null when neither publicId nor typebot id matches', async () => {
    vi.mocked(prisma.publicTypebot.findFirst).mockResolvedValue(null)

    const result = await findPublicTypebot({ publicId: 'missing' })

    expect(result).toBeNull()
  })
})
