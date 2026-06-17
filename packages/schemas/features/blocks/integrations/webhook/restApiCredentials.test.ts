import { describe, it, expect } from 'vitest'
import { restApiCredentialsSchema } from './schema'

const baseFields = {
  id: 'cred-1',
  createdAt: new Date(),
  workspaceId: 'ws-1',
  name: 'My API',
  iv: 'iv',
  createdById: 'user-1',
  type: 'rest-api' as const,
}

const parse = (data: unknown) =>
  restApiCredentialsSchema.safeParse({ ...baseFields, data })

describe('restApiCredentialsSchema', () => {
  it('accepts a valid credential with headers and query params', () => {
    expect(
      parse({
        baseUrl: 'https://api.example.com/v1',
        headers: [{ key: 'Authorization', value: 'Bearer x' }],
        queryParams: [{ key: 'api_key', value: 'secret' }],
      }).success
    ).toBe(true)
  })

  it('accepts a credential with only a base URL (headers/params optional)', () => {
    expect(parse({ baseUrl: 'https://api.example.com' }).success).toBe(true)
  })

  it('accepts a null createdById (legacy/unattributed rows)', () => {
    const result = restApiCredentialsSchema.safeParse({
      ...baseFields,
      createdById: null,
      data: { baseUrl: 'https://api.example.com' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid base URL', () => {
    expect(parse({ baseUrl: 'not-a-url' }).success).toBe(false)
  })

  it('rejects a non-http(s) base URL', () => {
    expect(parse({ baseUrl: 'ftp://example.com' }).success).toBe(false)
  })

  it('rejects a base URL containing userinfo (credential leak vector)', () => {
    expect(parse({ baseUrl: 'https://user:pass@api.example.com' }).success).toBe(
      false
    )
  })

  it('rejects an empty / whitespace-only header key', () => {
    expect(
      parse({
        baseUrl: 'https://api.example.com',
        headers: [{ key: '', value: 'x' }],
      }).success
    ).toBe(false)
    expect(
      parse({
        baseUrl: 'https://api.example.com',
        headers: [{ key: '   ', value: 'x' }],
      }).success
    ).toBe(false)
  })
})
