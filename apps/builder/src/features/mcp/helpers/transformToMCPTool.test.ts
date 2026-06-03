import { describe, it, expect } from 'vitest'
import { transformToMCPTool } from './transformToMCPTool'
import type { WorkflowTool } from '../types'

const baseTool: WorkflowTool = {
  id: 'tool-id',
  name: 'My Tool',
  tenant: 'acme',
  description: 'A tool',
  isPublished: true,
  variables: [],
  publicName: 'my-tool',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

describe('transformToMCPTool', () => {
  it('keeps an optional variable (required: false) in properties but out of required', () => {
    const result = transformToMCPTool({
      ...baseTool,
      variables: [
        { name: 'valorContraproposta', description: 'desc', required: false },
      ],
    })

    expect(result.inputSchema.properties).toHaveProperty('valorContraproposta')
    expect(result.inputSchema.required).not.toContain('valorContraproposta')
    expect(result.inputSchema.required).toEqual([])
  })

  it('keeps a variable with required: true in the required array', () => {
    const result = transformToMCPTool({
      ...baseTool,
      variables: [{ name: 'orderId', description: 'desc', required: true }],
    })

    expect(result.inputSchema.properties).toHaveProperty('orderId')
    expect(result.inputSchema.required).toContain('orderId')
  })

  it('treats a variable with no required flag as required (legacy default)', () => {
    const result = transformToMCPTool({
      ...baseTool,
      variables: [{ name: 'legacyVar', description: 'desc' }],
    })

    expect(result.inputSchema.properties).toHaveProperty('legacyVar')
    expect(result.inputSchema.required).toContain('legacyVar')
  })

  it('handles a mix of required and optional variables', () => {
    const result = transformToMCPTool({
      ...baseTool,
      variables: [
        { name: 'mandatory', description: 'm', required: true },
        { name: 'optional', description: 'o', required: false },
        { name: 'defaulted', description: 'd' },
      ],
    })

    expect(Object.keys(result.inputSchema.properties)).toEqual([
      'mandatory',
      'optional',
      'defaulted',
    ])
    expect(result.inputSchema.required).toEqual(['mandatory', 'defaulted'])
  })
})
