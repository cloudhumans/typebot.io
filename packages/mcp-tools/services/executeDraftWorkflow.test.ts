import { vi, describe, it, expect, beforeEach } from 'vitest'
import { executeDraftWorkflow } from './executeDraftWorkflow'
import { startChatPreview } from '@typebot.io/bot-engine/apiHandlers/startChatPreview'

vi.mock('@typebot.io/bot-engine/apiHandlers/startChatPreview', () => ({
  startChatPreview: vi.fn(),
}))
vi.mock('@typebot.io/lib/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const previewMock = startChatPreview as unknown as ReturnType<typeof vi.fn>

const typebot = {
  id: 'tool-1',
  version: '6',
  groups: [
    { blocks: [{ id: 'declare', type: 'Declare variables' }] },
    { blocks: [{ id: 'hook', type: 'Webhook' }] },
    { blocks: [{ id: 'end', type: 'workflow' }] },
  ],
} as unknown as Parameters<typeof executeDraftWorkflow>[0]['typebot']

const toolOutput = (response: unknown) => ({
  status: 'success',
  description: 'Tool Output',
  details: { response },
  blockId: 'end',
})
const webhookError = {
  status: 'error',
  description: 'Webhook returned an error.',
  details: { status: 500, body: 'boom' },
  blockId: 'hook',
}
const webhookOk = {
  status: 'success',
  description: 'Webhook successfully executed.',
  details: { status: 200 },
  blockId: 'hook',
}

const run = () =>
  executeDraftWorkflow({
    typebot,
    userId: 'user-1',
    prefilledVariables: { idPedido: '123' },
  })

describe('executeDraftWorkflow', () => {
  beforeEach(() => {
    previewMock.mockReset()
  })

  it('runs the draft headlessly as the user with the prefilled variables', async () => {
    previewMock.mockResolvedValue({ logs: [toolOutput('ok')] })

    await run()

    expect(previewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        typebotId: 'tool-1',
        typebot,
        userId: 'user-1',
        prefilledVariables: { idPedido: '123' },
        headless: true,
        isOnlyRegistering: false,
        isStreamEnabled: false,
        textBubbleContentFormat: 'markdown',
      })
    )
  })

  it('is a success when a Tool Output was produced', async () => {
    previewMock.mockResolvedValue({
      logs: [webhookOk, toolOutput({ status: 'shipped' })],
      visitedEdgeIds: ['e1', 'e2'],
      variables: [{ id: 'v1', name: 'idPedido', value: '123' }],
    })

    const result = await run()

    expect(result.status).toBe('success')
    expect(result.output).toBe('{"status":"shipped"}')
    expect(result.error).toBeNull()
    expect(result.trail).toEqual(['e1', 'e2'])
    expect(result.variables).toEqual([
      { id: 'v1', name: 'idPedido', value: '123' },
    ])
  })

  it('keeps the webhook logs in the response instead of filtering them out', async () => {
    previewMock.mockResolvedValue({ logs: [webhookOk, toolOutput('ok')] })

    const result = await run()

    expect(result.logs).toContainEqual(webhookOk)
  })

  it('reports a failed webhook with the block and the raw details', async () => {
    previewMock.mockResolvedValue({ logs: [webhookError] })

    const result = await run()

    expect(result.status).toBe('error')
    expect(result.output).toBeNull()
    expect(result.error).toEqual({
      message: 'Webhook returned an error.',
      blockId: 'hook',
      blockType: 'Webhook',
      details: { status: 500, body: 'boom' },
    })
  })

  it('reports an error when the Tool Output carries the transport marker', async () => {
    previewMock.mockResolvedValue({
      logs: [
        webhookError,
        toolOutput('Error from Typebot server: TypeError: fetch failed'),
      ],
    })

    const result = await run()

    expect(result.status).toBe('error')
    expect(result.output).toContain('Error from Typebot server:')
    expect(result.error?.blockId).toBe('hook')
  })

  it('reports an error when the flow ended without a Tool Output', async () => {
    previewMock.mockResolvedValue({ logs: [webhookOk] })

    const result = await run()

    expect(result.status).toBe('error')
    expect(result.output).toBeNull()
    expect(result.error?.message).toContain('Tool Output')
    expect(result.error?.blockId).toBeUndefined()
  })

  it('turns an engine throw (missing required variable) into an error result', async () => {
    previewMock.mockRejectedValue(
      new Error('Missing required variable "idPedido" for TOOL workflow')
    )

    const result = await run()

    expect(result.status).toBe('error')
    expect(result.error?.message).toBe(
      'Missing required variable "idPedido" for TOOL workflow'
    )
    expect(result.logs).toEqual([])
  })

  it('reports paused when the flow stopped at an input block', async () => {
    previewMock.mockResolvedValue({
      logs: [],
      input: { id: 'ask-name', type: 'text input' },
      visitedEdgeIds: ['e1'],
    })

    const result = await run()

    expect(result.status).toBe('paused')
    expect(result.output).toBeNull()
    expect(result.error?.blockId).toBe('ask-name')
    expect(result.error?.blockType).toBe('text input')
    expect(result.error?.message).toContain('input block')
    expect(result.trail).toEqual(['e1'])
  })

  it('reports paused when the flow stopped at a client-side action', async () => {
    previewMock.mockResolvedValue({
      logs: [],
      clientSideActions: [
        {
          type: 'setVariable',
          expectsDedicatedReply: true,
          lastBubbleBlockId: 'hook',
        },
      ],
    })

    const result = await run()

    expect(result.status).toBe('paused')
    expect(result.error?.message).toContain('client-side action')
    expect(result.error?.message).toContain('setVariable')
    expect(result.error?.blockId).toBeUndefined()
  })

  it('keeps the Tool Output when the flow paused after producing it', async () => {
    previewMock.mockResolvedValue({
      logs: [toolOutput('ok')],
      input: { id: 'ask-name', type: 'text input' },
    })

    const result = await run()

    expect(result.status).toBe('paused')
    expect(result.output).toBe('ok')
  })

  it('stays a success when a non-fatal error log sits next to a Tool Output', async () => {
    previewMock.mockResolvedValue({ logs: [webhookError, toolOutput('ok')] })

    const result = await run()

    expect(result.status).toBe('success')
    expect(result.error).toEqual({
      message: 'Webhook returned an error.',
      blockId: 'hook',
      blockType: 'Webhook',
      details: { status: 500, body: 'boom' },
    })
    expect(result.logs).toContainEqual(webhookError)
  })

  it('returns empty logs, trail and variables when the engine omits them', async () => {
    previewMock.mockResolvedValue({ logs: [toolOutput('ok')] })

    const result = await run()

    expect(result.logs).toEqual([toolOutput('ok')])
    expect(result.trail).toEqual([])
    expect(result.variables).toEqual([])
  })
})
