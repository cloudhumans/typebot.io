import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { verifyCognitoToken } from './verifyCognitoToken'

const jwksHolder = vi.hoisted(() => ({
  getKey: undefined as unknown as (
    protectedHeader: unknown,
    token: unknown
  ) => Promise<unknown>,
}))

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    createRemoteJWKSet: () => (protectedHeader: unknown, token: unknown) =>
      jwksHolder.getKey(protectedHeader, token),
  }
})

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
const cloudchatAppClientId = 'cloudchat-app-client-id'
const mcpAppClientId = 'mcp-app-client-id'

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256')
  privateKey = keyPair.privateKey
  const publicJwk = await exportJWK(keyPair.publicKey)
  const localJwks = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: 'RS256', use: 'sig' }],
  })
  jwksHolder.getKey = localJwks as unknown as typeof jwksHolder.getKey
})

const signTokenForAudience = (audience: string) =>
  new SignJWT({ email: 'claudia@acme.inc', 'custom:hub_role': 'CLIENT' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

const buildAudienceAllowlist = (mcpClientId?: string) =>
  [cloudchatAppClientId, mcpClientId].filter((audience): audience is string =>
    Boolean(audience)
  )

describe('verifyCognitoToken audience allowlist', () => {
  describe('when MCP_COGNITO_APP_CLIENT_ID is configured', () => {
    const allowlist = buildAudienceAllowlist(mcpAppClientId)

    it('accepts a token issued for the CloudChat app client', async () => {
      const token = await signTokenForAudience(cloudchatAppClientId)

      const payload = await verifyCognitoToken({
        cognitoToken: token,
        cognitoIssuerUrl: issuer,
        cognitoAppClientId: allowlist,
      })

      expect(payload.email).toBe('claudia@acme.inc')
    })

    it('accepts a token issued for the MCP app client', async () => {
      const token = await signTokenForAudience(mcpAppClientId)

      const payload = await verifyCognitoToken({
        cognitoToken: token,
        cognitoIssuerUrl: issuer,
        cognitoAppClientId: allowlist,
      })

      expect(payload.email).toBe('claudia@acme.inc')
    })

    it('rejects a token issued for an unknown app client', async () => {
      const token = await signTokenForAudience('unknown-app-client-id')

      await expect(
        verifyCognitoToken({
          cognitoToken: token,
          cognitoIssuerUrl: issuer,
          cognitoAppClientId: allowlist,
        })
      ).rejects.toThrow(/"aud"/)
    })
  })

  describe('when MCP_COGNITO_APP_CLIENT_ID is not configured', () => {
    const allowlist = buildAudienceAllowlist(undefined)

    it('collapses the allowlist to the CloudChat audience only', () => {
      expect(allowlist).toEqual([cloudchatAppClientId])
    })

    it('keeps accepting a token issued for the CloudChat app client', async () => {
      const token = await signTokenForAudience(cloudchatAppClientId)

      const payload = await verifyCognitoToken({
        cognitoToken: token,
        cognitoIssuerUrl: issuer,
        cognitoAppClientId: allowlist,
      })

      expect(payload.email).toBe('claudia@acme.inc')
    })

    it('rejects a token issued for the MCP app client', async () => {
      const token = await signTokenForAudience(mcpAppClientId)

      await expect(
        verifyCognitoToken({
          cognitoToken: token,
          cognitoIssuerUrl: issuer,
          cognitoAppClientId: allowlist,
        })
      ).rejects.toThrow(/"aud"/)
    })
  })
})
