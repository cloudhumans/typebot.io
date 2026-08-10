import { describe, it, expect } from 'vitest'
import { parseResponseBody, safeJsonParse } from './parseResponseBody'

describe('parseResponseBody', () => {
  it('returns the raw text when Content-Type claims JSON but the body is plain text (AWS Lambda Function URL 502 quirk)', async () => {
    // Incident 2026-06-12 (tenant zerezes): Lambda Function URL responded
    // HTTP 502 with `Content-Type: application/json` and the plain-text body
    // "Internal Server Error". Trusting the header and calling
    // `response.json()` threw a SyntaxError that escaped the webhook error
    // handling entirely.
    const response = new Response('Internal Server Error', {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseResponseBody(response)).resolves.toBe(
      'Internal Server Error'
    )
  })

  it('parses a valid JSON object body declared as JSON', async () => {
    const response = new Response(JSON.stringify({ orderId: 123, ok: true }), {
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseResponseBody(response)).resolves.toEqual({
      orderId: 123,
      ok: true,
    })
  })

  it('parses a valid JSON body even when Content-Type is not JSON (legacy behavior via safeJsonParse)', async () => {
    const response = new Response('{"message":"hello"}', {
      headers: { 'content-type': 'text/plain' },
    })

    await expect(parseResponseBody(response)).resolves.toEqual({
      message: 'hello',
    })
  })

  it('returns plain text bodies as-is', async () => {
    const response = new Response('just some text', {
      headers: { 'content-type': 'text/plain' },
    })

    await expect(parseResponseBody(response)).resolves.toBe('just some text')
  })

  it('unwraps a JSON-encoded string body to the string value', async () => {
    const response = new Response('"hello"', {
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseResponseBody(response)).resolves.toBe('hello')
  })

  it('returns an empty string for an empty body instead of throwing', async () => {
    const response = new Response('', {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseResponseBody(response)).resolves.toBe('')
  })

  it('parses JSON arrays and scalars', async () => {
    const response = new Response('[1,2,3]', {
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseResponseBody(response)).resolves.toEqual([1, 2, 3])
  })
})

describe('safeJsonParse', () => {
  it('parses valid JSON and flags it as JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ data: { a: 1 }, isJson: true })
  })

  it('falls back to the raw input when parsing fails', () => {
    expect(safeJsonParse('Internal Server Error')).toEqual({
      data: 'Internal Server Error',
      isJson: false,
    })
  })
})
