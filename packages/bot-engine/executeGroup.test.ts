import { Group, SessionState } from '@typebot.io/schemas'
import { IntegrationBlockType } from '@typebot.io/schemas/features/blocks/integrations/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The block execution itself is irrelevant here — we only care about how
// `executeGroup` annotates the logs it collects.
vi.mock('./executeIntegration', () => ({
  executeIntegration: () => () => ({
    logs: [{ status: 'success', description: 'Webhook executed' }],
  }),
}))

// Not exercised by these fixtures, but mocked so the module graph stays light:
// the real one reaches `executeTypebotLink` -> `continueBotFlow` -> the forge
// block registry, which pulls React logo components into the runner.
vi.mock('./executeLogic', () => ({
  executeLogic: () => () => null,
}))

// Not reached in these fixtures (single typebot in the queue, no outgoing edge),
// but mocked so importing the module never touches the database.
vi.mock('./getNextGroup', () => ({
  getNextGroup: vi.fn(async ({ state }: { state: SessionState }) => ({
    newSessionState: state,
  })),
}))

const { executeGroup } = await import('./executeGroup')

const webhookBlockId = 'block_webhook'

const group = {
  id: 'group_1',
  title: 'Group',
  graphCoordinates: { x: 0, y: 0 },
  blocks: [
    {
      id: webhookBlockId,
      type: IntegrationBlockType.WEBHOOK,
      options: {},
    },
  ],
} as unknown as Group

const stateWith = ({ resultId }: { resultId?: string }) =>
  ({
    version: '3',
    typebotsQueue: [
      {
        resultId,
        answers: [],
        typebot: {
          id: 'typebot_1',
          version: '6',
          groups: [group],
          edges: [],
          variables: [],
        },
      },
    ],
  } as unknown as SessionState)

const runGroup = (state: SessionState) =>
  executeGroup(group, {
    version: 2,
    state,
    visitedEdges: [],
    setVariableHistory: [],
    textBubbleContentFormat: 'richText',
  })

describe('executeGroup log attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('annotates blockId in preview (no resultId), for the per-block badge', async () => {
    const { logs } = await runGroup(stateWith({}))

    expect(logs).toHaveLength(1)
    expect(logs?.[0]).toMatchObject({ blockId: webhookBlockId })
  })

  it('never annotates blockId when the run has a resultId', async () => {
    // This is the guard that protects production: these logs are spread into
    // `prisma.log.createMany` through `upsertResult`, and the `Log` table has no
    // `blockId` column — annotating it there fails the write and errors the
    // chat request.
    const { logs } = await runGroup(stateWith({ resultId: 'result_1' }))

    expect(logs).toHaveLength(1)
    expect(logs?.[0]).not.toHaveProperty('blockId')
  })
})
