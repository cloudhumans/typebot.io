import { describe, expect, test } from 'vitest'
import { claudiaBlockSchema } from './schemas'
import { endFlow } from './actions/end-flow'
import { forwardToHuman } from './actions/forward-to-human'
import { forwardToHumanIgnoreHours } from './actions/forward-to-human-ignore-hours'
import { closeTicket } from './actions/close-ticket'
import { answerTicket } from './actions/answer_ticket'

const actions = [
  { name: endFlow.name, action: endFlow, expectedAction: 'END_FLOW' },
  {
    name: forwardToHuman.name,
    action: forwardToHuman,
    expectedAction: 'FORWARD_TO_HUMAN',
  },
  {
    name: forwardToHumanIgnoreHours.name,
    action: forwardToHumanIgnoreHours,
    expectedAction: 'FORWARD_TO_HUMAN_IGNORE_HOURS',
  },
  { name: closeTicket.name, action: closeTicket, expectedAction: 'CLOSE_TICKET' },
  { name: answerTicket.name, action: answerTicket, expectedAction: 'ANSWER_TICKET' },
]

/**
 * Runs an action's server handler with a stub logs store and returns the logs
 * it emitted. Mirrors what `executeForgedBlock` does at runtime.
 */
const runServer = (action: any, options: Record<string, unknown>) => {
  const emitted: any[] = []
  action.run.server({ options, logs: { add: (log: any) => emitted.push(log) } })
  return emitted
}

describe.each(actions)('$name', ({ action, expectedAction }) => {
  // The `tag` key inside the "Claudia Response" log details is the entire wire
  // contract with Claudia, which matches it by name and silently ignores any
  // other spelling. Guard the spelling, not just the presence.
  test('emits the tag in the Claudia Response log details', () => {
    const logs = runServer(action, { tag: 'caso_proativo_mat' })

    expect(logs).toHaveLength(1)
    expect(logs[0].status).toBe('success')
    expect(logs[0].description).toBe('Claudia Response')
    expect(logs[0].details).toMatchObject({
      action: expectedAction,
      tag: 'caso_proativo_mat',
    })
  })

  test('omitting the tag leaves it undefined and still emits the log', () => {
    const logs = runServer(action, {})

    expect(logs).toHaveLength(1)
    expect(logs[0].details.action).toBe(expectedAction)
    expect(logs[0].details.tag).toBeUndefined()
  })

  test('declares an optional Tag field under Advanced settings', () => {
    const tagField = (action as any).options?.shape?.tag

    expect(tagField).toBeDefined()
    expect(tagField.isOptional()).toBe(true)
    expect(tagField._def.layout).toMatchObject({
      label: 'Tag',
      accordion: 'Advanced settings',
    })
    // A default would tag conversations for flows that never opted in.
    expect(tagField._def.layout.defaultValue).toBeUndefined()
  })
})

describe('claudiaBlockSchema', () => {
  test('accepts a block carrying a tag', () => {
    const result = claudiaBlockSchema.safeParse({
      id: 'block-1',
      type: 'claudia',
      options: { action: 'Close Ticket [N1]', tag: 'caso_proativo_mat' },
    })

    expect(result.success).toBe(true)
    expect((result as any).data.options.tag).toBe('caso_proativo_mat')
  })

  test.each(actions.map(({ action }) => action.name))(
    'still parses a persisted %s block that has no tag key',
    (name) => {
      const result = claudiaBlockSchema.safeParse({
        id: 'block-2',
        type: 'claudia',
        options: { action: name },
      })

      expect(result.success).toBe(true)
      expect((result as any).data.options.tag).toBeUndefined()
    }
  )

  test('keeps topic and searchTerm working alongside tag', () => {
    const result = claudiaBlockSchema.safeParse({
      id: 'block-3',
      type: 'claudia',
      options: {
        action: 'Answer Ticket [N1]',
        topic: 'PAYMENT',
        searchTerm: 'firstUserMessage',
        tag: 'caso_proativo_mat',
      },
    })

    expect(result.success).toBe(true)
    expect((result as any).data.options).toMatchObject({
      topic: 'PAYMENT',
      searchTerm: 'firstUserMessage',
      tag: 'caso_proativo_mat',
    })
  })
})

describe('regression: tag does not disturb existing fields', () => {
  test('topic is still emitted by the four actions that declare it', () => {
    const topicActions = [
      { action: endFlow, expectedAction: 'END_FLOW' },
      { action: forwardToHuman, expectedAction: 'FORWARD_TO_HUMAN' },
      {
        action: forwardToHumanIgnoreHours,
        expectedAction: 'FORWARD_TO_HUMAN_IGNORE_HOURS',
      },
      { action: answerTicket, expectedAction: 'ANSWER_TICKET' },
    ]

    for (const { action, expectedAction } of topicActions) {
      const logs = runServer(action, { topic: 'PAYMENT', tag: 'campanha_x' })

      expect(logs[0].details, action.name).toMatchObject({
        action: expectedAction,
        topic: 'PAYMENT',
        tag: 'campanha_x',
      })
    }
  })

  test('searchTerm is still emitted by Answer Ticket', () => {
    const logs = runServer(answerTicket, {
      searchTerm: 'firstUserMessage',
      tag: 'campanha_x',
    })

    expect(logs[0].details).toMatchObject({
      action: 'ANSWER_TICKET',
      searchTerm: 'firstUserMessage',
      tag: 'campanha_x',
    })
  })
})
