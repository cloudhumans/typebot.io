import { describe, it, expect } from 'vitest'
import { typebotInSessionStateSchema } from './shared'

// Minimal valid v6 typebot-in-session object (the pick: version, id, groups,
// events, edges, variables, typebotId). `isToolWorkflow` is NOT a pick field —
// it is captured separately as an optional field, so legacy sessions serialized
// before it was carried must still parse.
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

describe('typebotInSessionStateSchema — isToolWorkflow back-compat', () => {
  it('parses a legacy session typebot WITHOUT isToolWorkflow (no throw, resolves to non-TOOL)', () => {
    const result = typebotInSessionStateSchema.safeParse(makeLegacyV6Typebot())

    expect(result.success).toBe(true)
    if (result.success) {
      // isToolWorkflow must be undefined, not a parse error — strict
      // getSession() parse would 500 on every pre-deploy session if this were a
      // REQUIRED field. undefined !== true → engine falls back to non-TOOL.
      expect(
        (result.data as { isToolWorkflow?: unknown }).isToolWorkflow
      ).toBeUndefined()
    }
  })

  it('parses a session typebot WITH isToolWorkflow: true', () => {
    const result = typebotInSessionStateSchema.safeParse({
      ...makeLegacyV6Typebot(),
      isToolWorkflow: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as { isToolWorkflow?: boolean }).isToolWorkflow).toBe(
        true
      )
    }
  })
})
