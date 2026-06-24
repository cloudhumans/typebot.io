import { vi, describe, it, expect, beforeEach } from 'vitest'
import { executeWorkflow } from './executeWorkflow'
import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'

// Literals mirrored from bot-engine (importing the block modules would pull the
// whole engine + Prisma into this unit suite). filterPotentiallySensitiveLogs
// strips logs by these exact descriptions.
const webhookErrorDescription = 'Webhook returned an error.'
const sendEmailErrorDescription = 'Email not sent'

vi.mock('@typebot.io/bot-engine/apiHandlers/startChat', () => ({
  startChat: vi.fn(),
}))
// executeWorkflow also imports filterPotentiallySensitiveLogs from bot-engine;
// stub it with the real predicate so the suite stays Prisma-free.
vi.mock(
  '@typebot.io/bot-engine/logs/filterPotentiallySensitiveLogs',
  () => ({
    filterPotentiallySensitiveLogs: (log: { description: string }) =>
      ![
        'Webhook returned an error.',
        'Webhook successfully executed.',
        'Email not sent',
        'Email successfully sent',
      ].includes(log.description),
  })
)
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
