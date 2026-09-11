import { describe, it, expect } from 'vitest'
import { resolveIsToolWorkflow } from './resolveIsToolWorkflow'

const tool = { settings: { general: { type: 'TOOL' as const } } }
const flow = { settings: { general: { type: 'default' as const } } }
const enrichment = { settings: { general: { type: 'CONTEXT_ENRICHMENT' as const } } }

describe('resolveIsToolWorkflow', () => {
  it('is true for a TOOL in a live session', () => {
    expect(resolveIsToolWorkflow(tool, { type: 'live' })).toBe(true)
  })

  it('treats CONTEXT_ENRICHMENT like TOOL in a live session', () => {
    expect(resolveIsToolWorkflow(enrichment, { type: 'live' })).toBe(true)
  })

  it('treats CONTEXT_ENRICHMENT like TOOL in the interactive builder preview', () => {
    expect(resolveIsToolWorkflow(enrichment, { type: 'preview' })).toBe(false)
  })

  it('is false for a TOOL in the interactive builder preview', () => {
    expect(resolveIsToolWorkflow(tool, { type: 'preview' })).toBe(false)
  })

  it('is true for a TOOL in a headless preview', () => {
    expect(
      resolveIsToolWorkflow(tool, { type: 'preview', headless: true })
    ).toBe(true)
  })

  it('is false for a non-TOOL flow whatever the mode', () => {
    expect(resolveIsToolWorkflow(flow, { type: 'live' })).toBe(false)
    expect(
      resolveIsToolWorkflow(flow, { type: 'preview', headless: true })
    ).toBe(false)
  })

  it('is false when settings are absent', () => {
    expect(resolveIsToolWorkflow({}, { type: 'live' })).toBe(false)
  })
})
