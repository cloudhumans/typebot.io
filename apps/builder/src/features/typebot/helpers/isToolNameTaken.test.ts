import { vi, describe, it, expect, beforeEach } from 'vitest'
import { isToolNameTaken } from './isToolNameTaken'
import prisma from '@typebot.io/lib/prisma'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findMany: vi.fn(),
    },
  },
}))

describe('isToolNameTaken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when an existing tool sanitizes to the same name', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'Get Order' } as any,
    ])

    await expect(
      isToolNameTaken({ name: 'get order', tenant: 'ten-1' })
    ).resolves.toBe(true)
  })

  it('returns false when no existing tool collides', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'Cancel Order' } as any,
    ])

    await expect(
      isToolNameTaken({ name: 'Get Order', tenant: 'ten-1' })
    ).resolves.toBe(false)
  })

  it('scopes the lookup to non-archived TOOL typebots of the given tenant', async () => {
    vi.mocked(prisma.typebot.findMany).mockResolvedValue([])

    await isToolNameTaken({ name: 'Get Order', tenant: 'ten-1' })

    expect(prisma.typebot.findMany).toHaveBeenCalledWith({
      where: {
        tenant: 'ten-1',
        isArchived: { not: true },
        settings: { path: ['general', 'type'], equals: 'TOOL' },
      },
      select: { name: true },
    })
  })
})
