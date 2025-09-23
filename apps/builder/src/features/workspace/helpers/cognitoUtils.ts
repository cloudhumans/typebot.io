import { WorkspaceRole } from '@typebot.io/prisma'

export interface CognitoUserClaims {
  'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
  'custom:tenant_id'?: string
}

export const extractCognitoUserClaims = (
  user: unknown
): CognitoUserClaims | undefined => {
  console.log('🔍 extractCognitoUserClaims Debug:')
  console.log('  user type:', typeof user)
  console.log('  user is object:', user && typeof user === 'object')

  if (!user) {
    console.log('  ❌ No user provided')
    return undefined
  }

  try {
    if (user && typeof user === 'object') {
      console.log('  User object keys:', Object.keys(user))
      console.log('  Has cognitoClaims:', 'cognitoClaims' in user)
      console.log('  Has custom:hub_role:', 'custom:hub_role' in user)
      console.log('  Has custom:tenant_id:', 'custom:tenant_id' in user)

      // Check if user has cognitoClaims object (from session)
      if ('cognitoClaims' in user) {
        const cognitoClaims = (user as Record<string, unknown>).cognitoClaims
        console.log('  Found cognitoClaims object:', cognitoClaims)
        if (cognitoClaims && typeof cognitoClaims === 'object') {
          const claims = {
            'custom:hub_role': (cognitoClaims as Record<string, unknown>)[
              'custom:hub_role'
            ] as 'ADMIN' | 'CLIENT' | 'MANAGER',
            'custom:tenant_id': (cognitoClaims as Record<string, unknown>)[
              'custom:tenant_id'
            ] as string,
          }
          console.log('  ✅ Extracted from cognitoClaims:', claims)
          return claims
        }
      }

      // Check if user has Cognito claims directly
      if ('custom:hub_role' in user && 'custom:tenant_id' in user) {
        const claims = {
          'custom:hub_role': (user as Record<string, unknown>)[
            'custom:hub_role'
          ] as 'ADMIN' | 'CLIENT' | 'MANAGER',
          'custom:tenant_id': (user as Record<string, unknown>)[
            'custom:tenant_id'
          ] as string,
        }
        console.log('  ✅ Extracted from user directly:', claims)
        return claims
      }

      // Check if claims are nested in a token object
      if ('token' in user) {
        const token = (user as Record<string, unknown>).token
        console.log('  Found token object:', token)
        if (
          token &&
          typeof token === 'object' &&
          'custom:hub_role' in token &&
          'custom:tenant_id' in token
        ) {
          const claims = {
            'custom:hub_role': (token as Record<string, unknown>)[
              'custom:hub_role'
            ] as 'ADMIN' | 'CLIENT' | 'MANAGER',
            'custom:tenant_id': (token as Record<string, unknown>)[
              'custom:tenant_id'
            ] as string,
          }
          console.log('  ✅ Extracted from token:', claims)
          return claims
        }
      }
    }

    console.log('  ❌ No Cognito claims found')
    return undefined
  } catch (error) {
    console.warn('Failed to extract Cognito user claims:', error)
    return undefined
  }
}

export const getUserWorkspaceNameFromCognito = (
  claims: CognitoUserClaims
): string | null => {
  console.log('🔍 getUserWorkspaceNameFromCognito Debug:')
  console.log('  Input claims:', claims)
  console.log('  tenant_id type:', typeof claims.tenant_id)
  console.log('  tenant_id value:', claims.tenant_id)
  console.log('  custom:tenant_id type:', typeof claims['custom:tenant_id'])
  console.log('  custom:tenant_id value:', claims['custom:tenant_id'])

  // Try both possible property names
  const result = claims['custom:tenant_id'] || claims.tenant_id || null
  console.log('  Returning workspace name:', result)
  return result
}

export const mapCognitoRoleToWorkspaceRole = (
  hubRole: string
): WorkspaceRole => {
  switch (hubRole) {
    case 'ADMIN':
    case 'MANAGER':
      return WorkspaceRole.ADMIN
    case 'CLIENT':
      return WorkspaceRole.MEMBER
    default:
      return WorkspaceRole.MEMBER
  }
}
