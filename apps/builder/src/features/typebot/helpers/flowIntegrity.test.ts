import { describe, it, expect } from 'vitest'
import {
  assertFlowIntegrity,
  assertUpdatePreservesIntegrity,
  dropSourcelessEdges,
  findDanglingReferences,
  sanitizeSoftReferences,
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

const references = (flow: unknown, severity?: 'hard' | 'soft') =>
  findDanglingReferences(flow as never)
    .filter((item) => !severity || item.severity === severity)
    .map((item) => item.reference)

describe('findDanglingReferences', () => {
  it('returns nothing for a consistent flow', () => {
    expect(findDanglingReferences(consistentFlow())).toEqual([])
  })

  it('tolerates null or non-array collections (legacy rows)', () => {
    expect(
      findDanglingReferences({ groups: null, edges: undefined, events: {} })
    ).toEqual([])
  })

  it('classifies an edge whose to.groupId is missing as hard, with or without to.blockId', () => {
    const flow = consistentFlow()
    flow.groups = [flow.groups[1]]
    expect(references(flow, 'hard')).toEqual([
      'edge e_start_a -> group grp_a',
      'edge e_b_c -> group grp_c',
    ])
  })

  it('classifies an edge whose to.blockId is not in the target group as hard and attributes it to the source group', () => {
    const flow = consistentFlow()
    flow.edges[1].to = { groupId: 'grp_b', blockId: 'blk_gone' }
    expect(findDanglingReferences(flow)).toEqual([
      {
        severity: 'hard',
        kind: 'target',
        reference: 'edge e_a_b -> block blk_gone',
        groupId: 'grp_a',
        edgeId: undefined,
      },
    ])
  })

  it('classifies outgoingEdgeIds of events, blocks and items that point at missing edges as soft', () => {
    const flow = consistentFlow()
    flow.edges = []
    const choice = {
      id: 'blk_choice',
      type: 'choice input',
      items: [{ id: 'item_1', outgoingEdgeId: 'e_item' }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flow.groups[2].blocks.push(choice as any)
    expect(references(flow, 'hard')).toEqual([])
    expect(references(flow, 'soft')).toEqual([
      'event ev_start -> edge e_start_a',
      'block blk_a -> edge e_a_b',
      'block blk_b -> edge e_b_c',
      'item item_1 -> edge e_item',
    ])
  })

  it('classifies an edge whose source event, block or item is missing as soft', () => {
    const flow = consistentFlow()
    flow.events = []
    flow.groups[0].blocks = []
    flow.edges.push({
      id: 'e_item',
      from: { blockId: 'blk_b', itemId: 'item_gone' },
      to: { groupId: 'grp_c' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(references(flow, 'soft')).toEqual([
      'edge e_start_a <- event ev_start',
      'edge e_a_b <- block blk_a',
      'edge e_item <- item item_gone',
    ])
    expect(references(flow, 'hard')).toEqual([])
  })
})

describe('sanitizeSoftReferences', () => {
  it('clears outgoingEdgeIds without an edge and drops edges without a source, leaving hard references alone', () => {
    const flow = consistentFlow()
    flow.groups[0].blocks = []
    flow.groups[2].blocks[0].outgoingEdgeId = 'e_gone'
    flow.edges.push({
      id: 'e_hard',
      from: { blockId: 'blk_b' },
      to: { groupId: 'grp_gone' },
    })

    const sanitized = sanitizeSoftReferences(flow)

    expect((sanitized.edges as { id: string }[]).map((e) => e.id)).toEqual([
      'e_start_a',
      'e_b_c',
      'e_hard',
    ])
    const groups = sanitized.groups as {
      id: string
      blocks: { id: string; outgoingEdgeId?: string }[]
    }[]
    expect(groups[2].blocks[0]).not.toHaveProperty('outgoingEdgeId')
    expect(groups[1].blocks[0].outgoingEdgeId).toBe('e_b_c')
    expect(references(sanitized, 'soft')).toEqual([])
    expect(references(sanitized, 'hard')).toEqual([
      'edge e_hard -> group grp_gone',
    ])
  })

  it('leaves non-array collections untouched', () => {
    expect(
      sanitizeSoftReferences({ groups: null, edges: null, events: undefined })
    ).toEqual({
      groups: null,
      edges: null,
      events: undefined,
    })
  })
})

describe('assertUpdatePreservesIntegrity', () => {
  it('rejects a partial groups array in terms of removed groups, never edges', () => {
    const existing = consistentFlow()
    const resulting = { ...existing, groups: [existing.groups[1]] }
    let message = ''
    try {
      assertUpdatePreservesIntegrity({ existing, resulting })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(
      "would replace the flow's 3 groups with 1, removing grp_a, grp_c"
    )
    expect(message).toContain('re-read the flow with getTypebot')
    expect(message).toContain('Do not delete edges')
    expect(message).not.toMatch(/edge e_/)
  })

  it('rejects partial groups together with an empty edges array (only soft references remain)', () => {
    const existing = consistentFlow()
    const resulting = { ...existing, groups: [existing.groups[1]], edges: [] }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).toThrow(/removing grp_a, grp_c/)
  })

  it('ignores edges left without a source (they are dropped on write) but still rejects the group removal they came with', () => {
    const existing = consistentFlow()
    const removedSourceOnly = {
      ...existing,
      groups: existing.groups.slice(1),
      edges: existing.edges.filter((e) => e.id !== 'e_start_a'),
      events: [{ ...existing.events[0], outgoingEdgeId: undefined }],
    }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting: removedSourceOnly })
    ).not.toThrow()
    expect(dropSourcelessEdges(removedSourceOnly)).toEqual([existing.edges[2]])

    const removedButStillReachable = {
      ...existing,
      groups: existing.groups.slice(1),
    }
    expect(() =>
      assertUpdatePreservesIntegrity({
        existing,
        resulting: removedButStillReachable,
      })
    ).toThrow(/removing grp_a/)
  })

  it('tolerates a stale outgoingEdgeId whose edge never existed in the stored flow, even after the stored copy was cleaned', () => {
    const existing = consistentFlow()
    const resulting = consistentFlow()
    resulting.groups[2].blocks[0].outgoingEdgeId = 'e_never_existed'
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).not.toThrow()
  })

  it('still rejects removing an edge while its source keeps pointing at it', () => {
    const existing = consistentFlow()
    const resulting = {
      ...existing,
      edges: existing.edges.filter((e) => e.id !== 'e_b_c'),
    }
    expect(() =>
      assertUpdatePreservesIntegrity({ existing, resulting })
    ).toThrow(/would leave 1 references .*block blk_b -> edge e_b_c/)
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

  it('accepts an update that leaves pre-existing dangling references untouched (delta check)', () => {
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
  it('rejects hard references on create, import, publish and rollback', () => {
    const flow = consistentFlow()
    flow.groups = [flow.groups[0]]
    expect(() => assertFlowIntegrity(flow, 'create')).toThrow(
      /Flow is inconsistent/
    )
    expect(() => assertFlowIntegrity(flow, 'import')).toThrow(/Cannot import/)
    expect(() => assertFlowIntegrity(flow, 'publish')).toThrow(/Cannot publish/)
    expect(() => assertFlowIntegrity(flow, 'rollback')).toThrow(
      /Cannot roll back/
    )
  })

  it('rejects soft references only on create', () => {
    const flow = consistentFlow()
    flow.groups[2].blocks[0].outgoingEdgeId = 'e_gone'
    expect(() => assertFlowIntegrity(flow, 'create')).toThrow(
      /block blk_c -> edge e_gone/
    )
    expect(() => assertFlowIntegrity(flow, 'import')).not.toThrow()
    expect(() => assertFlowIntegrity(flow, 'publish')).not.toThrow()
    expect(() => assertFlowIntegrity(flow, 'rollback')).not.toThrow()
  })

  it('accepts a consistent flow', () => {
    expect(() => assertFlowIntegrity(consistentFlow(), 'create')).not.toThrow()
  })

  it('caps the listed ids when many references dangle', () => {
    const edges = Array.from({ length: 15 }, (_, i) => ({
      id: `e_${i}`,
      from: { blockId: 'blk_x' },
      to: { groupId: `grp_${i}` },
    }))
    expect(() =>
      assertFlowIntegrity({ groups: [], edges, events: [] }, 'publish')
    ).toThrow(/and 5 more/)
  })
})
