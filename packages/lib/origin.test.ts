import { describe, expect, it } from 'vitest'
import { resolveEmbeddingTargetOrigins } from './origin'

const CLOUDCHAT = 'https://cloudchat.cloudhumans.com'
const CLOUDCHAT2 = 'https://cloudchat2.cloudhumans.com'
const EDDIE = 'https://eddie.us-east-1.prd.cloudhumans.io'
const WILDCARD = 'https://*.app.cloudhumans.com'

describe('resolveEmbeddingTargetOrigins', () => {
  it('returns every concrete allow-listed origin except our own', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, CLOUDCHAT, CLOUDCHAT2],
        selfOrigin: EDDIE,
      })
    ).toEqual([CLOUDCHAT, CLOUDCHAT2])
  })

  it('excludes wildcard entries (invalid postMessage targets)', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, WILDCARD, CLOUDCHAT],
        selfOrigin: EDDIE,
      })
    ).toEqual([CLOUDCHAT])
  })

  it('resolves a wildcard entry to the concrete parent via ancestorOrigins', () => {
    const parent = 'https://acme.app.cloudhumans.com'
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, WILDCARD],
        selfOrigin: EDDIE,
        ancestorOrigins: [parent],
      })
    ).toEqual([parent])
  })

  it('resolves a wildcard entry to the concrete parent via referrer', () => {
    const parent = 'https://acme.app.cloudhumans.com'
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, WILDCARD],
        selfOrigin: EDDIE,
        referrer: `${parent}/some/path?x=1`,
      })
    ).toEqual([parent])
  })

  it('ignores hints that are not allow-listed', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, CLOUDCHAT],
        selfOrigin: EDDIE,
        ancestorOrigins: ['https://evil.example.com'],
        referrer: 'https://evil.example.com/x',
      })
    ).toEqual([CLOUDCHAT])
  })

  it('never targets our own origin even when it appears as a hint', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, CLOUDCHAT],
        selfOrigin: EDDIE,
        ancestorOrigins: [EDDIE],
        referrer: `${EDDIE}/typebots/x/edit`,
      })
    ).toEqual([CLOUDCHAT])
  })

  it('does not duplicate an origin present both in the list and as a hint', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, CLOUDCHAT],
        selfOrigin: EDDIE,
        ancestorOrigins: [CLOUDCHAT],
        referrer: `${CLOUDCHAT}/x`,
      })
    ).toEqual([CLOUDCHAT])
  })

  it('returns no targets when only wildcards exist and no hint matches', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, WILDCARD],
        selfOrigin: EDDIE,
        ancestorOrigins: ['https://not-allowed.example.com'],
      })
    ).toEqual([])
  })

  it('tolerates a malformed referrer', () => {
    expect(
      resolveEmbeddingTargetOrigins({
        allowedOrigins: [EDDIE, CLOUDCHAT],
        selfOrigin: EDDIE,
        referrer: 'not-a-url',
      })
    ).toEqual([CLOUDCHAT])
  })
})
