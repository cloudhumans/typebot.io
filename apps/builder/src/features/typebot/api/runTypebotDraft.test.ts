import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { runTypebotDraft } from './runTypebotDraft'
import prisma from '@typebot.io/lib/prisma'
import { isWriteTypebotForbidden } from '@/features/typebot/helpers/isWriteTypebotForbidden'
import { executeDraftWorkflow } from '@typebot.io/mcp-tools'
import { assertLinkedTypebotsInWorkspace } from '@/features/typebot/helpers/assertLinkedTypebotsInWorkspace'
import { TRPCError } from '@trpc/server'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findFirst: vi.fn(),
    },
  },
}))
vi.mock('@/features/typebot/helpers/isWriteTypebotForbidden', () => ({
  isWriteTypebotForbidden: vi.fn(),
}))
vi.mock('@typebot.io/mcp-tools', () => ({
  executeDraftWorkflow: vi.fn(),
}))
vi.mock('@/features/typebot/helpers/assertLinkedTypebotsInWorkspace', () => ({
  assertLinkedTypebotsInWorkspace: vi.fn(),
}))

const user = { id: 'user-1', email: 'dev@acme.inc' }

const draft = {
  id: 'tool-1',
  version: '6',
  name: 'Get Order Status',
  workspaceId: 'ws-1',
  groups: [],
  edges: [],
  variables: [],
  theme: {},
  events: [
    { id: 'start-event', type: 'start', graphCoordinates: { x: 0, y: 0 } },
  ],
  settings: { general: { type: 'TOOL' } },
  collaborators: [],
  workspace: {
    id: 'ws-1',
    name: 'WS',
    isSuspended: false,
    isPastDue: false,
    members: [],
  },
}

const successResult = {
  status: 'success',
  output: '{"status":"shipped"}',
  error: null,
  logs: [],
  trail: [],
  variables: [],
}

const caller = () =>
  router({ runTypebotDraft }).createCaller({ user } as never).runTypebotDraft

describe('runTypebotDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(draft as never)
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(false)
    vi.mocked(executeDraftWorkflow).mockResolvedValue(successResult as never)
    vi.mocked(assertLinkedTypebotsInWorkspace).mockResolvedValue(undefined)
  })

  it('runs the draft as the caller with the given variables', async () => {
    const result = await caller()({
      typebotId: 'tool-1',
      variables: { idPedido: '123' },
    })

    expect(isWriteTypebotForbidden).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tool-1' }),
      user
    )
    expect(assertLinkedTypebotsInWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ rootId: 'tool-1', workspaceId: 'ws-1' })
    )
    expect(executeDraftWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        prefilledVariables: { idPedido: '123' },
        typebot: expect.objectContaining({ id: 'tool-1', version: '6' }),
      })
    )
    expect(executeDraftWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        typebot: expect.not.objectContaining({
          collaborators: expect.anything(),
        }),
      })
    )
    expect(result).toEqual(successResult)
  })

  it('responds NOT_FOUND when the typebot does not exist', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue(null)

    await expect(caller()({ typebotId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(executeDraftWorkflow).not.toHaveBeenCalled()
  })

  it('responds NOT_FOUND when the caller cannot write the typebot', async () => {
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(true)

    await expect(caller()({ typebotId: 'tool-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(executeDraftWorkflow).not.toHaveBeenCalled()
  })

  it('responds BAD_REQUEST for a conversational flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...draft,
      settings: { general: { type: 'default' } },
    } as never)

    await expect(caller()({ typebotId: 'tool-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(executeDraftWorkflow).not.toHaveBeenCalled()
  })

  it('accepts a CONTEXT_ENRICHMENT flow', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...draft,
      settings: { general: { type: 'CONTEXT_ENRICHMENT' } },
    } as never)

    const result = await caller()({
      typebotId: 'tool-1',
      variables: { helpdeskId: 'hd-1', lastUserMessages: 'oi' },
    })

    expect(executeDraftWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        prefilledVariables: { helpdeskId: 'hd-1', lastUserMessages: 'oi' },
      })
    )
    expect(result).toEqual(successResult)
  })

  it('responds BAD_REQUEST when a Typebot link leaves the workspace', async () => {
    vi.mocked(assertLinkedTypebotsInWorkspace).mockRejectedValue(
      new TRPCError({ code: 'BAD_REQUEST', message: 'another workspace' })
    )

    await expect(caller()({ typebotId: 'tool-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(executeDraftWorkflow).not.toHaveBeenCalled()
  })

  it('checks access before parsing, so a forbidden unparseable row is still NOT_FOUND', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...draft,
      events: null,
    } as never)
    vi.mocked(isWriteTypebotForbidden).mockResolvedValue(true)

    await expect(caller()({ typebotId: 'tool-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('responds INTERNAL_SERVER_ERROR when a headless row cannot be parsed', async () => {
    vi.mocked(prisma.typebot.findFirst).mockResolvedValue({
      ...draft,
      events: null,
    } as never)

    await expect(caller()({ typebotId: 'tool-1' })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(executeDraftWorkflow).not.toHaveBeenCalled()
  })
})
