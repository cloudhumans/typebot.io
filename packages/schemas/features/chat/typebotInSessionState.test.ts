import { describe, it, expect } from 'vitest'
import { typebotInSessionStateSchema } from './shared'

// Minimal valid v6 typebot-in-session object (the pick: version, id, groups,
// events, edges, variables, typebotId). `settings` is intentionally NOT a pick
// field — it is captured separately as an optional field, so legacy sessions
// serialized before `settings` was carried must still parse.
const makeLegacyV6Typebot = () => ({
  version: '6' as const,
  id: 'typebot-1',
  typebotId: 'typebot-1',
  groups: [],
  edges: [],
  variables: [],
  events: [
    {
      id: 'start-event',
      type: 'start',
      graphCoordinates: { x: 0, y: 0 },
    },
  ],
})

describe('typebotInSessionStateSchema — settings back-compat', () => {
  it('parses a legacy session typebot WITHOUT settings (no throw)', () => {
    const result = typebotInSessionStateSchema.safeParse(makeLegacyV6Typebot())

    expect(result.success).toBe(true)
    if (result.success) {
      // settings must be undefined, not a parse error — this is the exact
      // failure mode that would 500 getSession (strict parse) on deploy if
      // settings were carried as a REQUIRED pick field.
      expect((result.data as { settings?: unknown }).settings).toBeUndefined()
    }
  })

  it('parses a session typebot WITH settings and exposes the TOOL flag', () => {
    const result = typebotInSessionStateSchema.safeParse({
      ...makeLegacyV6Typebot(),
      settings: { general: { type: 'TOOL' } },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const data = result.data as {
        settings?: { general?: { type?: string } }
      }
      expect(data.settings?.general?.type).toBe('TOOL')
    }
  })
})
