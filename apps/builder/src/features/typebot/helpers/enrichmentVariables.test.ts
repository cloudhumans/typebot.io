import { describe, expect, it } from 'vitest'
import {
  findMissingEnrichmentBuiltIns,
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
