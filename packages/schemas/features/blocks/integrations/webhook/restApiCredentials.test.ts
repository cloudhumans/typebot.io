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

describe('restApiCredentialsSchema', () => {
  it('accepts a valid credential with headers and query params', () => {
    const result = restApiCredentialsSchema.safeParse({
      ...baseFields,
      data: {
        baseUrl: 'https://api.example.com/v1',
        headers: [{ key: 'Authorization', value: 'Bearer x' }],
        queryParams: [{ key: 'api_key', value: 'secret' }],
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a credential with only a base URL (headers/params optional)', () => {
    const result = restApiCredentialsSchema.safeParse({
      ...baseFields,
      data: { baseUrl: 'https://api.example.com' },
    })
    expect(result.success).toBe(true)
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
    const result = restApiCredentialsSchema.safeParse({
      ...baseFields,
      data: { baseUrl: 'not-a-url' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty header key', () => {
    const result = restApiCredentialsSchema.safeParse({
      ...baseFields,
      data: {
        baseUrl: 'https://api.example.com',
        headers: [{ key: '', value: 'x' }],
      },
    })
    expect(result.success).toBe(false)
  })
})
