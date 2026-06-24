import { vi, describe, it, expect, beforeEach } from 'vitest'
import { executeWorkflow } from './executeWorkflow'
import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'
import { webhookErrorDescription } from '@typebot.io/bot-engine/blocks/integrations/webhook/executeWebhookBlock'
import { sendEmailErrorDescription } from '@typebot.io/bot-engine/blocks/integrations/sendEmail/executeSendEmailBlock'

vi.mock('@typebot.io/bot-engine/apiHandlers/startChat', () => ({
  startChat: vi.fn(),
}))
vi.mock('@typebot.io/lib/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const startChatMock = startChat as unknown as ReturnType<typeof vi.fn>

describe('executeWorkflow', () => {
  beforeEach(() => {
    startChatMock.mockReset()
  })

  it('asks startChat for unfiltered logs (skipSensitiveLogFiltering: true)', async () => {
    startChatMock.mockResolvedValue({ logs: [] })

    await executeWorkflow({ publicId: 'my-tool' })

    expect(startChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: 'my-tool',
        skipSensitiveLogFiltering: true,
      })
    )
  })

  it('derives isError from an unfiltered webhook error log', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        {
          status: 'error',
          description: webhookErrorDescription,
          details: { statusCode: 500 },
        },
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(true)
  })

  it('strips sensitive logs (webhook/sendEmail) from the returned result', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        { status: 'info', description: 'Tool Output', details: { response: 'ok' } },
        {
          status: 'error',
          description: sendEmailErrorDescription,
          // Unmasked secret: the sendEmail `!emailBody` branch logs this raw.
          details: { transportConfig: { auth: { pass: 'super-secret' } } },
        },
        {
          status: 'error',
          description: webhookErrorDescription,
          details: { responseBody: 'sensitive' },
        },
      ],
    })

    const { result, isError } = await executeWorkflow({ publicId: 'my-tool' })

    // isError still derived from the raw error logs...
    expect(isError).toBe(true)
    // ...but the secret-carrying logs are filtered out of the envelope.
    const descriptions = result.logs?.map((l) => l.description)
    expect(descriptions).toEqual(['Tool Output'])
    expect(JSON.stringify(result)).not.toContain('super-secret')
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })

  it('returns isError false and preserves non-sensitive logs on success', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        { status: 'info', description: 'Tool Output', details: { response: 'ok' } },
      ],
    })

    const { result, isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
    expect(result.logs).toEqual([
      { status: 'info', description: 'Tool Output', details: { response: 'ok' } },
    ])
  })
})
