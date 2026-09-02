import { describe, expect, it } from 'vitest'
import {
  ENRICHMENT_STARTER_GROUP_TITLE,
  ENRICHMENT_VARIABLES_GROUP_TITLE,
  buildEnrichmentStarterFlow,
  findMissingEnrichmentBuiltIns,
  normalizeEnrichmentDeclareVariables,
  withBuiltInEnrichmentVariables,
} from './enrichmentVariables'

describe('findMissingEnrichmentBuiltIns', () => {
  it('returns all five names for an empty list', () => {
    expect(findMissingEnrichmentBuiltIns([])).toEqual([
      'helpdeskId',
      'contactName',
      'contactEmail',
      'contactPhone',
      'contactExternalId',
    ])
  })

  it('returns only the names not present', () => {
    const variables = [
      { name: 'helpdeskId' },
      { name: 'contactName' },
      { name: 'contactEmail' },
      { name: 'custom' },
    ]
    expect(findMissingEnrichmentBuiltIns(variables)).toEqual([
      'contactPhone',
      'contactExternalId',
    ])
  })

  it('returns empty when all five are present', () => {
    const variables = [
      { name: 'helpdeskId' },
      { name: 'contactName' },
      { name: 'contactEmail' },
      { name: 'contactPhone' },
      { name: 'contactExternalId' },
    ]
    expect(findMissingEnrichmentBuiltIns(variables)).toEqual([])
  })
})

describe('withBuiltInEnrichmentVariables', () => {
  it('prepends the five built-ins to an empty list with generated ids', () => {
    const result = withBuiltInEnrichmentVariables([])
    expect(result).toHaveLength(5)
    expect(result.map((v) => v.name)).toEqual([
      'helpdeskId',
      'contactName',
      'contactEmail',
      'contactPhone',
      'contactExternalId',
    ])
    expect(new Set(result.map((v) => v.id)).size).toBe(5)
  })

  it('keeps existing variables and adds only the missing built-ins', () => {
    const existing = [
      { id: 'v1', name: 'helpdeskId' },
      { id: 'v2', name: 'custom' },
    ]
    const result = withBuiltInEnrichmentVariables(existing)
    expect(result.map((v) => v.name)).toEqual([
      'contactName',
      'contactEmail',
      'contactPhone',
      'contactExternalId',
      'helpdeskId',
      'custom',
    ])
    expect(result.find((v) => v.name === 'helpdeskId')?.id).toBe('v1')
  })
})

describe('normalizeEnrichmentDeclareVariables', () => {
  const builtInVariables = [
    { id: 'v1', name: 'helpdeskId' },
    { id: 'v2', name: 'contactName' },
    { id: 'v3', name: 'contactEmail' },
    { id: 'v4', name: 'contactPhone' },
    { id: 'v5', name: 'contactExternalId' },
  ]

  const declareBlock = (id: string, variableId = 'v-any') => ({
    id,
    type: 'Declare variables',
    options: {
      variables: [{ variableId, description: 'x', required: true }],
    },
  })

  it('appends a detached canonical group when no Declare variables block exists', () => {
    const { groups, edges } = normalizeEnrichmentDeclareVariables({
      groups: [],
      edges: [],
      variables: builtInVariables,
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe(ENRICHMENT_VARIABLES_GROUP_TITLE)
    expect(
      groups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(edges).toEqual([])
  })

  it('keeps the ids of an existing declare-only group stable and rewrites its options', () => {
    const carrier = {
      id: 'g-carrier',
      title: 'renamed by user',
      graphCoordinates: { x: 10, y: 20 },
      blocks: [declareBlock('b-carrier', 'v-tampered')],
    }

    const { groups } = normalizeEnrichmentDeclareVariables({
      groups: [carrier],
      edges: [],
      variables: builtInVariables,
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('g-carrier')
    expect(groups[0].graphCoordinates).toEqual({ x: 10, y: 20 })
    expect(groups[0].blocks[0].id).toBe('b-carrier')
    expect(
      groups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
  })

  it('strips declare blocks out of mixed groups and drops the edges that reached or left them', () => {
    const mixedGroup = {
      id: 'g-mixed',
      title: 'Group',
      graphCoordinates: { x: 0, y: 0 },
      blocks: [{ id: 'b-text', type: 'text' }, declareBlock('b-declare')],
    }

    const { groups, edges } = normalizeEnrichmentDeclareVariables({
      groups: [mixedGroup],
      edges: [
        {
          id: 'e-out',
          from: { blockId: 'b-declare' },
          to: { groupId: 'g-other' },
        },
        {
          id: 'e-kept',
          from: { blockId: 'b-text' },
          to: { groupId: 'g-other' },
        },
      ],
      variables: builtInVariables,
    })

    expect(groups.map((g) => g.title)).toEqual([
      'Group',
      ENRICHMENT_VARIABLES_GROUP_TITLE,
    ])
    expect(groups[0].blocks.map((b) => b.id)).toEqual(['b-text'])
    expect(edges.map((e) => e.id)).toEqual(['e-kept'])
  })

  it('keeps edges into the canonical group and the block outgoing edge so the flow stays wired', () => {
    const carrier = {
      id: 'g-carrier',
      title: ENRICHMENT_VARIABLES_GROUP_TITLE,
      graphCoordinates: { x: 0, y: 0 },
      blocks: [{ ...declareBlock('b-carrier'), outgoingEdgeId: 'e-out' }],
    }

    const { groups, edges } = normalizeEnrichmentDeclareVariables({
      groups: [carrier],
      edges: [
        {
          id: 'e-in',
          from: { eventId: 'start' },
          to: { groupId: 'g-carrier' },
        },
        {
          id: 'e-out',
          from: { blockId: 'b-carrier' },
          to: { groupId: 'g-next' },
        },
      ],
      variables: builtInVariables,
    })

    expect(edges.map((e) => e.id)).toEqual(['e-in', 'e-out'])
    expect(groups[0].blocks[0].outgoingEdgeId).toBe('e-out')
  })

  it('declares the built-ins as not required so empty prefilled values never block the run', () => {
    const { groups } = normalizeEnrichmentDeclareVariables({
      groups: [],
      edges: [],
      variables: builtInVariables,
    })

    expect(
      groups[0].blocks[0].options.variables.every(
        (v: { required: boolean }) => v.required === false
      )
    ).toBe(true)
  })
})

describe('buildEnrichmentStarterFlow', () => {
  const builtInVariables = [
    { id: 'v1', name: 'helpdeskId' },
    { id: 'v2', name: 'contactName' },
    { id: 'v3', name: 'contactEmail' },
    { id: 'v4', name: 'contactPhone' },
    { id: 'v5', name: 'contactExternalId' },
  ]

  it('wires start -> declare variables -> return output consistently', () => {
    const { events, edges, groups } = buildEnrichmentStarterFlow()

    expect(events).toHaveLength(1)
    expect(edges).toHaveLength(2)
    expect(groups).toHaveLength(2)
    expect(groups[0].title).toBe(ENRICHMENT_VARIABLES_GROUP_TITLE)
    expect(groups[1].title).toBe(ENRICHMENT_STARTER_GROUP_TITLE)
    expect(events[0].outgoingEdgeId).toBe(edges[0].id)
    expect(edges[0].from.eventId).toBe(events[0].id)
    expect(edges[0].to.groupId).toBe(groups[0].id)
    expect(edges[1].from.blockId).toBe(groups[0].blocks[0].id)
    expect(edges[1].to.groupId).toBe(groups[1].id)
    expect(groups[0].blocks[0].outgoingEdgeId).toBe(edges[1].id)
  })

  it('seeds a Return Output block with a parseable Custom JSON example using the built-ins', () => {
    const { groups } = buildEnrichmentStarterFlow()
    const block = groups[1].blocks[0]

    expect(block.type).toBe('workflow')
    expect(block.options.responseType).toBe('Custom JSON')
    const parsed = JSON.parse(block.options.customJson)
    expect(parsed.cliente).toBe('{{contactName}}')
    expect(parsed.id_crm).toBe('{{contactExternalId}}')
  })

  it('generates fresh ids on every call', () => {
    const first = buildEnrichmentStarterFlow()
    const second = buildEnrichmentStarterFlow()

    expect(first.groups[0].id).not.toBe(second.groups[0].id)
    expect(first.events[0].id).not.toBe(second.events[0].id)
  })

  it('survives normalization keeping both edges and canonicalizing the declare group in place', () => {
    const starter = buildEnrichmentStarterFlow()
    const { groups, edges } = normalizeEnrichmentDeclareVariables({
      groups: starter.groups,
      edges: starter.edges,
      variables: builtInVariables,
    })

    expect(edges).toEqual(starter.edges)
    expect(groups.map((g) => g.title)).toEqual([
      ENRICHMENT_VARIABLES_GROUP_TITLE,
      ENRICHMENT_STARTER_GROUP_TITLE,
    ])
    expect(groups[0].blocks[0].id).toBe(starter.groups[0].blocks[0].id)
    expect(groups[0].blocks[0].outgoingEdgeId).toBe(starter.edges[1].id)
    expect(
      groups[0].blocks[0].options.variables.map(
        (v: { variableId: string }) => v.variableId
      )
    ).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
  })
})
