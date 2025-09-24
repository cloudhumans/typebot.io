import { WorkspaceRole } from '@typebot.io/prisma'

export interface CognitoUserClaims {
  'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
  'custom:tenant_id'?: string
}

export const extractCognitoUserClaims = (
  user: unknown
): CognitoUserClaims | undefined => {
  if (typeof user !== 'object' || user === null) {
    return undefined
  }

  const userObj = user as Record<string, unknown>

  // Try different extraction patterns
  // Pattern 1: Claims are in a cognitoClaims object
  if ('cognitoClaims' in userObj && userObj.cognitoClaims) {
    const cognitoClaims = userObj.cognitoClaims as Record<string, unknown>
    if (
      'custom:hub_role' in cognitoClaims &&
      'custom:tenant_id' in cognitoClaims
    ) {
      return {
        'custom:hub_role': cognitoClaims['custom:hub_role'] as
          | 'ADMIN'
          | 'CLIENT'
          | 'MANAGER',
        'custom:tenant_id': cognitoClaims['custom:tenant_id'] as string,
      }
    }
  }

  // Pattern 2: Claims are directly on the user object
  if ('custom:hub_role' in userObj && 'custom:tenant_id' in userObj) {
    return {
      'custom:hub_role': userObj['custom:hub_role'] as
        | 'ADMIN'
        | 'CLIENT'
        | 'MANAGER',
      'custom:tenant_id': userObj['custom:tenant_id'] as string,
    }
  }

  // Pattern 3: Claims might be in a nested token structure
  if ('token' in userObj && userObj.token) {
    const token = userObj.token as Record<string, unknown>
    if (
      'custom:hub_role' in token &&
      'custom:tenant_id' in token &&
      token['custom:hub_role'] &&
      token['custom:tenant_id']
    ) {
      return {
        'custom:hub_role': token['custom:hub_role'] as
          | 'ADMIN'
          | 'CLIENT'
          | 'MANAGER',
        'custom:tenant_id': token['custom:tenant_id'] as string,
      }
    }
  }

  return undefined
}

export const getUserWorkspaceNameFromCognito = (
  claims: CognitoUserClaims
): string | null => {
  return claims['custom:tenant_id'] || null
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
