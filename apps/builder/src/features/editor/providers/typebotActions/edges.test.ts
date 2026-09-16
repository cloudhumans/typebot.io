import { describe, it, expect } from 'vitest'
import { deleteEdgeDraft } from './edges'
import { deleteGroupDraft } from './blocks'

const flow = (targetFirst: boolean) => {
  const target = {
    id: 'grp_target',
    title: 'target',
    graphCoordinates: { x: 900, y: 0 },
    blocks: [{ id: 'blk_target', type: 'text', content: { richText: [] } }],
  }
  const source = {
    id: 'grp_source',
    title: 'source',
    graphCoordinates: { x: 400, y: 0 },
    blocks: [
      {
        id: 'blk_source',
        type: 'text',
        content: { richText: [] },
        outgoingEdgeId: 'e_source_target',
      },
    ],
  }
  return {
    version: '6',
    events: [
      {
        id: 'ev_start',
        type: 'start',
        graphCoordinates: { x: 0, y: 0 },
        outgoingEdgeId: 'e_start_source',
      },
    ],
    groups: targetFirst ? [target, source] : [source, target],
    edges: [
      {
        id: 'e_start_source',
        from: { eventId: 'ev_start' },
        to: { groupId: 'grp_source' },
      },
      {
        id: 'e_source_target',
        from: { blockId: 'blk_source' },
        to: { groupId: 'grp_target' },
      },
    ],
  }
}

const sourceBlock = (typebot: ReturnType<typeof flow>) =>
  typebot.groups.find((g) => g.id === 'grp_source')!.blocks[0] as {
    outgoingEdgeId?: string
  }

describe('deleteGroupDraft', () => {
  it.each([
    ['target group listed first', true],
    ['source group listed first', false],
  ])(
    'removes the edges into a deleted group and unwires their source blocks (%s)',
    (_label, targetFirst) => {
      const typebot = flow(targetFirst)
      const targetIndex = typebot.groups.findIndex((g) => g.id === 'grp_target')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteGroupDraft(typebot as any)(targetIndex)

      expect(typebot.groups.map((g) => g.id)).toEqual(['grp_source'])
      expect(typebot.edges.map((e) => e.id)).toEqual(['e_start_source'])
      expect(sourceBlock(typebot).outgoingEdgeId).toBeUndefined()
      expect(typebot.events[0].outgoingEdgeId).toBe('e_start_source')
    }
  )

  it('also removes the edges leaving the deleted group and unwires the start event', () => {
    const typebot = flow(true)
    const sourceIndex = typebot.groups.findIndex((g) => g.id === 'grp_source')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteGroupDraft(typebot as any)(sourceIndex)

    expect(typebot.groups.map((g) => g.id)).toEqual(['grp_target'])
    expect(typebot.edges).toEqual([])
    expect(typebot.events[0].outgoingEdgeId).toBeUndefined()
  })
})

describe('deleteEdgeDraft', () => {
  it('removes an edge whose source block no longer exists without throwing', () => {
    const typebot = flow(true)
    typebot.groups.find((g) => g.id === 'grp_source')!.blocks = []

    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteEdgeDraft({ typebot: typebot as any, edgeId: 'e_source_target' })
    ).not.toThrow()
    expect(typebot.edges.map((e) => e.id)).toEqual(['e_start_source'])
  })
})
