import { SessionState } from '@typebot.io/schemas'
import { describe, expect, it, vi } from 'vitest'

// Never called on these paths (single typebot in the queue), mocked so the
// import never reaches the database client.
vi.mock('./queries/upsertResult', () => ({
  upsertResult: vi.fn(),
}))

// Belt and braces: CI runs the unit tests without `prisma generate`, so any
// transitive import of the real client would fail to resolve.
vi.mock('@typebot.io/lib/prisma', () => ({ default: {} }))

const { getNextGroup } = await import('./getNextGroup')

const targetGroup = {
  id: 'group_target',
  title: 'Target',
  graphCoordinates: { x: 0, y: 0 },
  blocks: [],
}

const edge = (id: string) => ({
  id,
  from: { blockId: 'block_from' },
  to: { groupId: targetGroup.id },
})

const stateWith = ({
  resultId,
  edges,
  previewMetadata,
}: {
  resultId?: string
  edges: ReturnType<typeof edge>[]
  previewMetadata?: Record<string, unknown>
}) =>
  ({
    version: '3',
    previewMetadata,
    typebotsQueue: [
      {
        resultId,
        answers: [],
        typebot: {
          id: 'typebot_1',
          version: '6',
          groups: [targetGroup],
          edges,
          variables: [],
        },
      },
    ],
  } as unknown as SessionState)

describe('getNextGroup trail recording in preview', () => {
  it('accumulates a regular edge in trailEdgeIds', async () => {
    const { newSessionState } = await getNextGroup({
      state: stateWith({
        edges: [edge('edge_1')],
        previewMetadata: { trailEdgeIds: ['edge_0'] },
      }),
      edgeId: 'edge_1',
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.trailEdgeIds).toEqual([
      'edge_0',
      'edge_1',
    ])
  })

  it('ignores virtual edges in trailEdgeIds', async () => {
    // Virtual edges (jumps) have no line in the editor, so highlighting them
    // would paint a path the user cannot see.
    const { newSessionState } = await getNextGroup({
      state: stateWith({
        edges: [edge('virtual-edge_1')],
        previewMetadata: { trailEdgeIds: ['edge_0'] },
      }),
      edgeId: 'virtual-edge_1',
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.trailEdgeIds).toEqual(['edge_0'])
  })

  it('keeps visitedEdges limited to off-default decisions', async () => {
    // `visitedEdges` feeds transcript rebuilding and must stay as it was before
    // the trail split: only branch decisions, never the default path.
    const onDefaultPath = await getNextGroup({
      state: stateWith({ edges: [edge('edge_1')] }),
      edgeId: 'edge_1',
      isOffDefaultPath: false,
    })
    expect(
      onDefaultPath.newSessionState.previewMetadata?.visitedEdges
    ).toBeUndefined()

    const offDefaultPath = await getNextGroup({
      state: stateWith({ edges: [edge('edge_2')] }),
      edgeId: 'edge_2',
      isOffDefaultPath: true,
    })
    expect(
      offDefaultPath.newSessionState.previewMetadata?.visitedEdges
    ).toEqual(['edge_2'])
  })

  it('records both an off-default edge and its trail entry', async () => {
    const { newSessionState } = await getNextGroup({
      state: stateWith({ edges: [edge('edge_3')] }),
      edgeId: 'edge_3',
      isOffDefaultPath: true,
    })

    expect(newSessionState.previewMetadata?.visitedEdges).toEqual(['edge_3'])
    expect(newSessionState.previewMetadata?.trailEdgeIds).toEqual(['edge_3'])
  })
})

// Returning from a linked typebot merges variable *values* by name while each
// side keeps its own variable id. The captured value type is keyed by id, so it
// has to be carried over the same way or the debug panel describes the wrong
// value.
const linkedState = ({
  isMergingWithParent,
  childValue = '5',
  variableTypes,
}: {
  isMergingWithParent: boolean
  childValue?: string | null
  variableTypes: Record<string, string>
}) =>
  ({
    version: '3',
    previewMetadata: { variableTypes },
    typebotsQueue: [
      {
        // The linked typebot, about to be popped: no edges left and nothing to
        // trigger when done, so the pop ends the run.
        answers: [],
        isMergingWithParent,
        edgeIdToTriggerWhenDone: undefined,
        typebot: {
          id: 'typebot_child',
          version: '6',
          groups: [targetGroup],
          edges: [],
          variables: [{ id: 'child_foo', name: 'foo', value: childValue }],
        },
      },
      {
        answers: [],
        typebot: {
          id: 'typebot_parent',
          version: '6',
          groups: [targetGroup],
          edges: [],
          variables: [{ id: 'parent_foo', name: 'foo', value: 'text' }],
        },
      },
    ],
  } as unknown as SessionState)

describe('getNextGroup value types across a linked typebot', () => {
  it("carries the linked typebot's type onto the parent's variable id", async () => {
    // The parent's own stale type is the dangerous case: it answers with
    // authority and describes a value that is no longer there.
    const { newSessionState } = await getNextGroup({
      state: linkedState({
        isMergingWithParent: true,
        variableTypes: { child_foo: 'number', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.typebotsQueue[0].typebot.variables).toEqual([
      { id: 'parent_foo', name: 'foo', value: '5' },
    ])
    expect(newSessionState.previewMetadata?.variableTypes).toMatchObject({
      parent_foo: 'number',
    })
  })

  it('leaves the parent type alone when the link does not merge', async () => {
    // Without merging, the parent keeps its own value, so it must keep its type.
    const { newSessionState } = await getNextGroup({
      state: linkedState({
        isMergingWithParent: false,
        variableTypes: { child_foo: 'number', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.typebotsQueue[0].typebot.variables).toEqual([
      { id: 'parent_foo', name: 'foo', value: 'text' },
    ])
    expect(newSessionState.previewMetadata?.variableTypes).toMatchObject({
      parent_foo: 'string',
    })
  })

  it('leaves the parent type alone when the linked variable has no value', async () => {
    // Mirrors the `?? variable.value` in the merge: the parent keeps its value,
    // so the type it already had still describes it.
    const { newSessionState } = await getNextGroup({
      state: linkedState({
        isMergingWithParent: true,
        childValue: null,
        variableTypes: { child_foo: 'number', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.typebotsQueue[0].typebot.variables).toEqual([
      { id: 'parent_foo', name: 'foo', value: 'text' },
    ])
    expect(newSessionState.previewMetadata?.variableTypes).toMatchObject({
      parent_foo: 'string',
    })
  })

  it('does nothing when no type was ever captured', async () => {
    // Published runs never record types; the merge must still work.
    const { newSessionState } = await getNextGroup({
      state: linkedState({ isMergingWithParent: true, variableTypes: {} }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.variableTypes).toEqual({})
  })

  it('drops the popped typebot own entries, so they cannot rot', async () => {
    // `fillVariablesWithExistingValues` refills a linked typebot's variables by
    // name on a second visit without recording a type. A leftover entry from the
    // first visit would then be inherited by the parent on the next pop and
    // describe a value the link never wrote.
    const { newSessionState } = await getNextGroup({
      state: linkedState({
        isMergingWithParent: true,
        variableTypes: { child_foo: 'number', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.variableTypes).toEqual({
      parent_foo: 'number',
    })
  })
})

// Queue shapes the pruning has to survive: a variable only the linked typebot
// declares (carried over with its own id) and a grandparent still sitting in the
// queue behind the parent.
const nestedLinkState = ({
  variableTypes,
}: {
  variableTypes: Record<string, string>
}) =>
  ({
    version: '3',
    previewMetadata: { variableTypes },
    typebotsQueue: [
      {
        answers: [],
        isMergingWithParent: true,
        // Resumes on an edge the parent owns, so the pop stops here. Without it
        // the parent has nothing left to walk either and gets popped in the same
        // recursion, taking the grandparent's turn.
        edgeIdToTriggerWhenDone: 'edge_parent',
        typebot: {
          id: 'typebot_child',
          version: '6',
          groups: [targetGroup],
          edges: [],
          // `childOnly` has no counterpart in the parent, so the merge appends it
          // keeping this id.
          variables: [{ id: 'child_only', name: 'childOnly', value: '7' }],
        },
      },
      {
        answers: [],
        typebot: {
          id: 'typebot_parent',
          version: '6',
          groups: [targetGroup],
          edges: [edge('edge_parent')],
          variables: [{ id: 'parent_foo', name: 'foo', value: 'text' }],
        },
      },
      {
        answers: [],
        typebot: {
          id: 'typebot_grandparent',
          version: '6',
          groups: [targetGroup],
          edges: [],
          variables: [{ id: 'grandparent_bar', name: 'bar', value: 'text' }],
        },
      },
    ],
  } as unknown as SessionState)

describe('getNextGroup pruning of captured types', () => {
  it('keeps the type of a variable only the linked typebot declared', async () => {
    // The merge appends it under its own id, so the id is still in the session.
    const { newSessionState } = await getNextGroup({
      state: nestedLinkState({
        variableTypes: { child_only: 'number', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.variableTypes).toEqual({
      child_only: 'number',
      parent_foo: 'string',
    })
  })

  it("keeps a grandparent's type through a nested link", async () => {
    // Pruning against the whole queue, not just its head: the grandparent is
    // still there behind the parent and its variables will be read again.
    const { newSessionState } = await getNextGroup({
      state: nestedLinkState({
        variableTypes: { grandparent_bar: 'boolean', parent_foo: 'string' },
      }),
      edgeId: undefined,
      isOffDefaultPath: false,
    })

    expect(newSessionState.previewMetadata?.variableTypes).toMatchObject({
      grandparent_bar: 'boolean',
    })
  })
})
