import { vi, describe, it, expect, beforeEach } from 'vitest'
import { getWorkflowTools } from './getWorkflowTools'
import prisma from '@typebot.io/lib/prisma'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findMany: vi.fn(),
    },
  },
}))
vi.mock('@typebot.io/lib/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findManyMock = (prisma as any).typebot.findMany as ReturnType<
  typeof vi.fn
>

const makeToolTypebot = (
  declaredVariables: Array<{
    variableId: string
    description?: string
    required?: boolean
  }>
) => ({
  id: 'typebot-1234567',
  name: 'Solides Tool',
  tenant: 'solides',
  toolDescription: 'Send a counter proposal',
  settings: { general: { type: 'TOOL' } },
  variables: [
    { id: 'v1', name: 'valorContraproposta', description: 'amount' },
    { id: 'v2', name: 'orderId', description: 'order id' },
  ],
  publicId: 'solides-tool',
  groups: [
    {
      blocks: [
        {
          type: 'Declare variables',
          options: { variables: declaredVariables },
        },
      ],
    },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  publishedTypebot: { id: 'pub-1' },
})

describe('getWorkflowTools', () => {
  beforeEach(() => {
    findManyMock.mockReset()
  })

  it('propagates required: false from the Declare Variables block', async () => {
    findManyMock.mockResolvedValue([
      makeToolTypebot([
        { variableId: 'v1', description: 'amount', required: false },
        { variableId: 'v2', description: 'order id', required: true },
      ]),
    ])

    const { tools } = await getWorkflowTools({ tenant: 'solides' })

    expect(tools).toHaveLength(1)
    const optional = tools[0].variables.find(
      (v) => v.name === 'valorContraproposta'
    )
    const mandatory = tools[0].variables.find((v) => v.name === 'orderId')
    expect(optional?.required).toBe(false)
    expect(mandatory?.required).toBe(true)
  })

  it('defaults required to true when the flag is absent (legacy tools)', async () => {
    findManyMock.mockResolvedValue([
      makeToolTypebot([{ variableId: 'v1', description: 'amount' }]),
    ])

    const { tools } = await getWorkflowTools({ tenant: 'solides' })

    const variable = tools[0].variables.find(
      (v) => v.name === 'valorContraproposta'
    )
    expect(variable?.required).toBe(true)
  })
})
