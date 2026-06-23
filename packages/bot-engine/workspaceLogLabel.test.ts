import { describe, it, expect } from 'vitest'
import { workspaceLogLabel } from './workspaceLogLabel'

describe('workspaceLogLabel', () => {
  it('uses the name when present', () => {
    expect(workspaceLogLabel({ id: 'ws_1', name: 'Acme' })).toBe('Acme')
  })

  it('falls back to the id when the name is missing', () => {
    expect(workspaceLogLabel({ id: 'ws_1', name: null })).toBe('ws_1')
    expect(workspaceLogLabel({ id: 'ws_1' })).toBe('ws_1')
  })

  it("falls back to the id when the name is the 'unknown' sentinel", () => {
    expect(workspaceLogLabel({ id: 'ws_1', name: 'unknown' })).toBe('ws_1')
  })

  it("returns 'unknown' only when neither a real name nor a real id exists", () => {
    expect(workspaceLogLabel({ id: 'unknown', name: 'unknown' })).toBe(
      'unknown'
    )
    expect(workspaceLogLabel({})).toBe('unknown')
    expect(workspaceLogLabel(undefined)).toBe('unknown')
  })
})
