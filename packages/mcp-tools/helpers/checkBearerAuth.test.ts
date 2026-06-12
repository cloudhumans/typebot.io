import { describe, it, expect } from 'vitest'
import { checkBearerAuth } from './checkBearerAuth'

const TOKEN = 'super-secret-token'

describe('checkBearerAuth', () => {
  it('authorizes a matching Bearer token', () => {
    expect(checkBearerAuth(`Bearer ${TOKEN}`, TOKEN)).toEqual({
      authorized: true,
    })
  })

  it('fails closed when no token is configured on the server', () => {
    expect(checkBearerAuth(`Bearer ${TOKEN}`, undefined)).toEqual({
      authorized: false,
      reason: 'misconfigured',
    })
    expect(checkBearerAuth(`Bearer ${TOKEN}`, '')).toEqual({
      authorized: false,
      reason: 'misconfigured',
    })
  })

  it('rejects a missing Authorization header', () => {
    expect(checkBearerAuth(undefined, TOKEN)).toEqual({
      authorized: false,
      reason: 'missing',
    })
  })

  it('rejects a header without the Bearer scheme', () => {
    expect(checkBearerAuth(TOKEN, TOKEN)).toEqual({
      authorized: false,
      reason: 'missing',
    })
    expect(checkBearerAuth(`Basic ${TOKEN}`, TOKEN)).toEqual({
      authorized: false,
      reason: 'missing',
    })
  })

  it('rejects a wrong token of the same length', () => {
    const wrong = 'x'.repeat(TOKEN.length)
    expect(checkBearerAuth(`Bearer ${wrong}`, TOKEN)).toEqual({
      authorized: false,
      reason: 'invalid',
    })
  })

  it('rejects a wrong token of a different length without throwing', () => {
    expect(checkBearerAuth('Bearer short', TOKEN)).toEqual({
      authorized: false,
      reason: 'invalid',
    })
    expect(checkBearerAuth(`Bearer ${TOKEN}-extra`, TOKEN)).toEqual({
      authorized: false,
      reason: 'invalid',
    })
  })

  it('rejects an empty Bearer token', () => {
    // "Bearer " with nothing after it has no capture group match.
    expect(checkBearerAuth('Bearer ', TOKEN)).toEqual({
      authorized: false,
      reason: 'missing',
    })
  })
})
