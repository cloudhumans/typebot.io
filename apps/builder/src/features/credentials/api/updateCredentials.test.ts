import { vi, describe, it, expect, beforeEach } from 'vitest'
import { router } from '@/helpers/server/trpc'
import { updateCredentials, mergeMaskedSecrets } from './updateCredentials'
import { maskedValue } from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'
import prisma from '@typebot.io/lib/prisma'
import { encrypt } from '@typebot.io/lib/api/encryption/encrypt'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { isAdminWriteWorkspaceForbidden } from '@/features/workspace/helpers/isAdminWriteWorkspaceForbidden'

const txUpdate = vi.fn()

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    workspace: { findUnique: vi.fn() },
    credentials: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ credentials: { update: txUpdate } })
    ),
  },
}))
vi.mock('@typebot.io/lib/api/encryption/encrypt', () => ({
  encrypt: vi.fn(),
}))
vi.mock('@typebot.io/lib/api/encryption/decrypt', () => ({
  decrypt: vi.fn(),
}))
vi.mock('@typebot.io/lib/credentials/findCredentialsUsages', () => ({
  findCredentialsUsages: vi.fn(),
}))
vi.mock('@typebot.io/lib/logger', () => ({ default: { warn: vi.fn() } }))
vi.mock('@/features/workspace/helpers/isWriteWorkspaceForbidden', () => ({
  isWriteWorkspaceForbidden: vi.fn(),
}))
vi.mock('@/features/workspace/helpers/isAdminWriteWorkspaceForbidden', () => ({
  isAdminWriteWorkspaceForbidden: vi.fn(),
}))

describe('mergeMaskedSecrets', () => {
  it('preserves an untouched (masked) value from the prior entry by key', () => {
    const merged = mergeMaskedSecrets(
      [{ key: 'Authorization', value: maskedValue }],
      [{ key: 'Authorization', value: 'Bearer real-token' }]
    )
    expect(merged).toEqual([
      { key: 'Authorization', value: 'Bearer real-token' },
    ])
  })

  it('keeps a freshly typed value as-is', () => {
    const merged = mergeMaskedSecrets(
      [{ key: 'Authorization', value: 'Bearer new-token' }],
      [{ key: 'Authorization', value: 'Bearer old-token' }]
    )
    expect(merged).toEqual([
      { key: 'Authorization', value: 'Bearer new-token' },
    ])
  })

  it('passes through a brand new entry with a real value', () => {
    const merged = mergeMaskedSecrets([{ key: 'X-Api-Key', value: 'k123' }], [])
    expect(merged).toEqual([{ key: 'X-Api-Key', value: 'k123' }])
  })

  it('throws when a masked value cannot be matched to a prior key', () => {
    expect(() =>
      mergeMaskedSecrets([{ key: 'X-New', value: maskedValue }], [])
    ).toThrow()
  })
})

describe('updateCredentials', () => {
  const user = { id: 'user-1', email: 'admin@test.com' }
  const workspace = { id: 'ws-1', members: [] }
  const existingData = {
    baseUrl: 'https://api.example.com/v1',
    headers: [{ key: 'Authorization', value: 'Bearer real-token' }],
    queryParams: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(workspace as never)
    vi.mocked(prisma.credentials.findFirst).mockResolvedValue({
      type: 'rest-api',
      data: 'enc',
      iv: 'iv',
      deprecatedAt: null,
    } as never)
    vi.mocked(decrypt).mockResolvedValue(existingData as never)
    vi.mocked(encrypt).mockResolvedValue({
      encryptedData: 'enc2',
      iv: 'iv2',
    } as never)
    vi.mocked(findCredentialsUsages).mockResolvedValue([])
    vi.mocked(isWriteWorkspaceForbidden).mockReturnValue(false)
    vi.mocked(isAdminWriteWorkspaceForbidden).mockReturnValue(false)
  })

  const caller = router({ updateCredentials }).createCaller({
    user,
  } as never)
  const call = (input: Record<string, unknown>) =>
    caller.updateCredentials({
      credentialsId: 'cred-1',
      workspaceId: workspace.id,
      ...input,
    } as never)

  it('forbids non-admins from editing rest-api credentials', async () => {
    vi.mocked(isAdminWriteWorkspaceForbidden).mockReturnValue(true)
    await expect(call({ name: 'New name' })).rejects.toThrow(/admins can edit/)
  })

  it('requires confirmation when a request-affecting change hits published flows', async () => {
    vi.mocked(findCredentialsUsages).mockResolvedValue([
      {
        source: 'PublicTypebot',
        via: 'block',
        typebotId: 't1',
        publicId: 'p1',
        name: 'Live flow',
      },
    ])
    await expect(
      call({
        data: {
          baseUrl: 'https://api.example.com/v2',
          headers: [{ key: 'Authorization', value: maskedValue }],
          queryParams: [],
        },
      })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(txUpdate).not.toHaveBeenCalled()
  })

  it('persists the change once confirmed', async () => {
    vi.mocked(findCredentialsUsages).mockResolvedValue([
      {
        source: 'PublicTypebot',
        via: 'block',
        typebotId: 't1',
        publicId: 'p1',
        name: 'Live flow',
      },
    ])
    await call({
      confirmed: true,
      data: {
        baseUrl: 'https://api.example.com/v2',
        headers: [{ key: 'Authorization', value: maskedValue }],
        queryParams: [],
      },
    })
    expect(txUpdate).toHaveBeenCalledOnce()
    // Untouched secret preserved through the merge before re-encryption.
    expect(encrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: [{ key: 'Authorization', value: 'Bearer real-token' }],
      })
    )
  })

  it('does not consult published-flow guard for a deprecation-only edit', async () => {
    vi.mocked(findCredentialsUsages).mockResolvedValue([
      {
        source: 'PublicTypebot',
        via: 'block',
        typebotId: 't1',
        publicId: 'p1',
        name: 'Live flow',
      },
    ])
    await call({ deprecated: true })
    expect(findCredentialsUsages).not.toHaveBeenCalled()
    expect(txUpdate).toHaveBeenCalledOnce()
  })
})
