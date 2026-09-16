import { describe, expect, test } from 'vitest'
import { claudiaBlockSchema } from './schemas'
import { claudiaBlock } from './index'
import { endFlow } from './actions/end-flow'
import { forwardToHuman } from './actions/forward-to-human'
import { forwardToHumanIgnoreHours } from './actions/forward-to-human-ignore-hours'
import { closeTicket } from './actions/close-ticket'
import { answerTicket } from './actions/answer_ticket'

/**
 * The actions that end a turn by stopping the ticket, and so can be told to do it
 * without talking to the customer. `Answer Ticket` and `End Flow` are excluded on
 * purpose: the first hands the turn back to ClaudIA to answer, and the second keeps
 * the conversation going — neither has a message to suppress.
 */
const silentCapableActions = [
  { name: closeTicket.name, action: closeTicket, expectedAction: 'CLOSE_TICKET' },
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
]

const runServer = (action: any, options: Record<string, unknown>) => {
  const emitted: any[] = []
  action.run.server({ options, logs: { add: (log: any) => emitted.push(log) } })
  return emitted
}

describe.each(silentCapableActions)('$name', ({ action, expectedAction }) => {
  // `silent` inside the "Claudia Response" log details is the whole wire contract:
  // Claudia matches it by name and ignores any other spelling, so a rename here
  // would silently go back to messaging the customer. Guard the spelling.
  test('emits silent in the Claudia Response log details', () => {
    const logs = runServer(action, { silent: true })

    expect(logs).toHaveLength(1)
    expect(logs[0].description).toBe('Claudia Response')
    expect(logs[0].details).toMatchObject({
      action: expectedAction,
      silent: true,
    })
  })

  test('omitting silent leaves it undefined, so the flow keeps messaging', () => {
    const logs = runServer(action, {})

    expect(logs[0].details.action).toBe(expectedAction)
    expect(logs[0].details.silent).toBeUndefined()
  })

  test('an explicit false is carried through as false', () => {
    const logs = runServer(action, { silent: false })

    expect(logs[0].details.silent).toBe(false)
  })

  test('declares an optional Silent field under Advanced settings', () => {
    const silentField = (action as any).options?.shape?.silent

    expect(silentField).toBeDefined()
    expect(silentField.isOptional()).toBe(true)
    expect(silentField._def.layout).toMatchObject({
      label: 'Silent (no message sent)',
      accordion: 'Advanced settings',
    })
    // A default would silence flows that never opted in.
    expect(silentField._def.layout.defaultValue).toBeUndefined()
  })

  test('silent rides alongside the tag without disturbing it', () => {
    const logs = runServer(action, { silent: true, tag: 'campanha_x' })

    expect(logs[0].details).toMatchObject({
      action: expectedAction,
      silent: true,
      tag: 'campanha_x',
    })
  })
})

describe('claudiaBlock.actions', () => {
  // Read from the block registry rather than the hand-written list above, so a
  // new terminal action added without the field is caught here.
  test('only the ticket-stopping actions declare Silent', () => {
    const withSilent = claudiaBlock.actions
      .filter((action) => (action as any).options?.shape?.silent)
      .map((action) => action.name)

    expect(withSilent.sort()).toEqual(
      silentCapableActions.map(({ name }) => name).sort()
    )
    expect((answerTicket as any).options?.shape?.silent).toBeUndefined()
    expect((endFlow as any).options?.shape?.silent).toBeUndefined()
  })
})

describe('claudiaBlockSchema', () => {
  test('accepts a block carrying silent', () => {
    const result = claudiaBlockSchema.safeParse({
      id: 'block-1',
      type: 'claudia',
      options: { action: 'Close Ticket [N1]', silent: true },
    })

    expect(result.success).toBe(true)
    expect((result as any).data.options.silent).toBe(true)
  })

  test.each(silentCapableActions.map(({ action }) => action.name))(
    'still parses a persisted %s block that has no silent key',
    (name) => {
      const result = claudiaBlockSchema.safeParse({
        id: 'block-2',
        type: 'claudia',
        options: { action: name },
      })

      expect(result.success).toBe(true)
      expect((result as any).data.options.silent).toBeUndefined()
    }
  )
})
