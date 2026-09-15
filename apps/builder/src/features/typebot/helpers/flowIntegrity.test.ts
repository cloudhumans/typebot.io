import { describe, it, expect } from 'vitest'
import {
  assertFlowIntegrity,
  assertUpdatePreservesIntegrity,
  findDanglingReferences,
} from './flowIntegrity'

const block = (id: string, outgoingEdgeId?: string) => ({
  id,
  type: 'text',
  content: { richText: [] },
  outgoingEdgeId,
})

const group = (id: string, blocks: ReturnType<typeof block>[]) => ({
  id,
  title: id,
  graphCoordinates: { x: 0, y: 0 },
  blocks,
})

const consistentFlow = () => ({
  events: [
    {
      id: 'ev_start',
      type: 'start',
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: 'e_start_a',
    },
  ],
  groups: [
    group('grp_a', [block('blk_a', 'e_a_b')]),
    group('grp_b', [block('blk_b', 'e_b_c')]),
    group('grp_c', [block('blk_c')]),
  ],
  edges: [
    {
      id: 'e_start_a',
      from: { eventId: 'ev_start' },
      to: { groupId: 'grp_a' },
    },
    {
      id: 'e_a_b',
      from: { blockId: 'blk_a' },
      to: { groupId: 'grp_b', blockId: 'blk_b' },
    },
    { id: 'e_b_c', from: { blockId: 'blk_b' }, to: { groupId: 'grp_c' } },
  ],
})

describe('findDanglingReferences', () => {
  it('returns nothing for a consistent flow', () => {
    expect(findDanglingReferences(consistentFlow())).toEqual([])
  })

  it('tolerates null or non-array collections (legacy rows)', () => {
    expect(
      findDanglingReferences({ groups: null, edges: undefined, events: {} })
    ).toEqual([])
  })

  it('flags an edge whose to.groupId is missing, with or without to.blockId', () => {
    const flow = consistentFlow()
    flow.groups = [flow.groups[1]]
    expect(findDanglingReferences(flow)).toEqual([
      'edge e_start_a -> group grp_a',
      'edge e_b_c -> group grp_c',
    ])
  })

  it('flags an edge whose to.blockId is not in the target group', () => {
    const flow = consistentFlow()
    flow.edges[1].to = { groupId: 'grp_b', blockId: 'blk_gone' }
    expect(findDanglingReferences(flow)).toEqual([
      'edge e_a_b -> block blk_gone',
    ])
  })

  it('flags outgoingEdgeIds of events, blocks and items that point at missing edges', () => {
    const flow = consistentFlow()
    flow.edges = []
    const choice = {
      id: 'blk_choice',
      type: 'choice input',
      items: [{ id: 'item_1', outgoingEdgeId: 'e_item' }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flow.groups[2].blocks.push(choice as any)
    expect(findDanglingReferences(flow)).toEqual([
      'event ev_start -> edge e_start_a',
      'block blk_a -> edge e_a_b',
      'block blk_b -> edge e_b_c',
      'item item_1 -> edge e_item',
    ])
  })
})

describe('assertUpdatePreservesIntegrity', () => {
  it('rejects a partial groups array in terms of removed groups, never edges', () => {
    const existing = consistentFlow()
    const resulting = {
      ...existing,
      groups: [existing.groups[1]],
    }
    let message = ''
    try {
      assertUpdatePreservesIntegrity({ existing, resulting })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(
      "would replace the flow's 3 groups with 1, removing grp_a, grp_c"
    )
    expect(message).toContain('replaced wholesale')
    expect(message).toContain('Do not delete edges')
    expect(message).not.toMatch(/edge e_/)
  })

  it('rejects stale edges with a message that does not blame removed groups', () => {
    const existing = consistentFlow()
    const resulting = { ...existing, edges: [existing.edges[0]] }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).toThrow(/would leave 2 references/)
  })

  it('accepts a consistent removal of a group together with its edges', () => {
    const existing = consistentFlow()
    const resulting = {
      events: existing.events,
      groups: [
        group('grp_a', [block('blk_a')]),
        group('grp_c', [block('blk_c')]),
      ],
      edges: [existing.edges[0]],
    }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).not.toThrow()
  })

  it('accepts an update that leaves a pre-existing dangling reference untouched (delta check)', () => {
    const existing = consistentFlow()
    existing.edges.push({
      id: 'e_legacy',
      from: { blockId: 'blk_gone' },
      to: { groupId: 'grp_gone' },
    })
    const resulting = {
      ...existing,
      groups: existing.groups.map((g) =>
        g.id === 'grp_b' ? { ...g, title: 'renamed' } : g
      ),
    }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).not.toThrow()
  })

  it('still rejects new dangling references on top of legacy ones', () => {
    const existing = consistentFlow()
    existing.edges.push({
      id: 'e_legacy',
      from: { blockId: 'blk_gone' },
      to: { groupId: 'grp_gone' },
    })
    const resulting = { ...existing, groups: [existing.groups[0]] }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).toThrow(/removing grp_b, grp_c/)
  })
})

describe('assertFlowIntegrity', () => {
  it('rejects an inconsistent flow on create, publish and rollback', () => {
    const flow = consistentFlow()
    flow.groups = [flow.groups[0]]
    expect(() => assertFlowIntegrity(flow, 'create')).toThrow(
      /Flow is inconsistent/
    )
    expect(() => assertFlowIntegrity(flow, 'publish')).toThrow(/Cannot publish/)
    expect(() => assertFlowIntegrity(flow, 'rollback')).toThrow(
      /Cannot roll back/
    )
  })

  it('accepts a consistent flow', () => {
    expect(() => assertFlowIntegrity(consistentFlow(), 'publish')).not.toThrow()
  })

  it('caps the listed ids when many references dangle', () => {
    const edges = Array.from({ length: 15 }, (_, i) => ({
      id: `e_${i}`,
      from: { blockId: 'blk_x' },
      to: { groupId: `grp_${i}` },
    }))
    expect(() =>
      assertFlowIntegrity({ groups: [], edges, events: [] }, 'create')
    ).toThrow(/and 5 more/)
  })
})
