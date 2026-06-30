import { vi, describe, it, expect, beforeEach } from 'vitest'
import { executeWorkflow } from './executeWorkflow'
import { startChat } from '@typebot.io/bot-engine/apiHandlers/startChat'

// Literals mirrored from bot-engine (importing the block modules would pull the
// whole engine + Prisma into this unit suite). filterPotentiallySensitiveLogs
// strips logs by these exact descriptions.
const webhookErrorDescription = 'Webhook returned an error.'
const sendEmailErrorDescription = 'Email not sent'
// Marker masked into a transport-failure body by the webhook engine — kept in
// lockstep with executeWorkflow's TYPEBOT_ERROR_MARKER and claudia-agentic's
// detectSwallowedToolError shim.
const TYPEBOT_ERROR_MARKER = 'Error from Typebot server:'

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

const toolOutput = (response: unknown) => ({
  status: 'info',
  description: 'Tool Output',
  details: { response },
})

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

  it('strips sensitive logs (webhook/sendEmail) from the returned result', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        toolOutput('ok'),
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

    const { result } = await executeWorkflow({ publicId: 'my-tool' })

    // The secret-carrying logs are filtered out of the envelope.
    const descriptions = result.logs?.map((l) => l.description)
    expect(descriptions).toEqual(['Tool Output'])
    expect(JSON.stringify(result)).not.toContain('super-secret')
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })

  it('returns isError false and preserves non-sensitive logs on success', async () => {
    startChatMock.mockResolvedValue({
      logs: [toolOutput('ok')],
    })

    const { result, isError, output } = await executeWorkflow({
      publicId: 'my-tool',
    })

    expect(isError).toBe(false)
    expect(output).toBe('ok')
    expect(result.logs).toEqual([toolOutput('ok')])
  })

  // --- isError contract (parity with detectSwallowedToolError shim) ---------
  // Only flag a run when it produced NO usable Tool Output, OR the output it
  // produced carries the typebot transport-error marker. A non-fatal error log
  // alongside a valid Tool Output is NOT an error — flagging it would make the
  // MCP adapter throw and replace the answer with "Please fix your mistakes".

  it('flags a failed run that produced NO Tool Output (no usable answer)', async () => {
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

    // No Tool Output log → falls back to JSON.stringify → no usable answer.
    expect(isError).toBe(true)
  })

  it('does NOT flag a NocoDB run with a missing-field error but a valid Tool Output', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        {
          status: 'error',
          description: 'Field foo does not exist in the table',
        },
        toolOutput({ rows: [{ id: 1 }] }),
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
  })

  it('does NOT flag a CNPJ-in-CPF-block warning with a valid Tool Output', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        {
          status: 'error',
          description: '⚠️ This appears to be a CNPJ, not a CPF',
        },
        toolOutput({ valid: false }),
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
  })

  it('does NOT flag a Script block that caught a server-side error but produced output', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        { status: 'error', description: 'ReferenceError: x is not defined' },
        toolOutput('partial result'),
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
  })

  it('does NOT flag a Webhook→Return Output 4xx body (deliberately exposed, no marker)', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        {
          status: 'error',
          description: webhookErrorDescription,
          details: { statusCode: 404 },
        },
        // The Return Output exposes the 4xx HTTP body as the answer on purpose.
        toolOutput({ error: 'Not Found', code: 404 }),
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
  })

  it('flags a transport failure routed to Return Output (marker present DESPITE a Tool Output)', async () => {
    // This is the PR's original target and the case C-pure (!hadToolOutput
    // alone) would miss: a `fetch failed` masked into the "Last HTTP Response"
    // body, which IS a truthy Tool Output.
    startChatMock.mockResolvedValue({
      logs: [
        {
          status: 'error',
          description: webhookErrorDescription,
          details: { statusCode: 500 },
        },
        toolOutput({
          message: `${TYPEBOT_ERROR_MARKER} TypeError: fetch failed`,
        }),
      ],
    })

    const { isError, output } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(true)
    expect(output).toContain(TYPEBOT_ERROR_MARKER)
  })

  it('flags a transport failure when the marker rides a plain-string Tool Output', async () => {
    startChatMock.mockResolvedValue({
      logs: [
        { status: 'error', description: webhookErrorDescription },
        toolOutput(`${TYPEBOT_ERROR_MARKER} TypeError: fetch failed`),
      ],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(true)
  })

  it('does NOT flag a clean run with no error logs even without a Tool Output', async () => {
    startChatMock.mockResolvedValue({
      logs: [{ status: 'info', description: 'something benign' }],
    })

    const { isError } = await executeWorkflow({ publicId: 'my-tool' })

    expect(isError).toBe(false)
  })
})
