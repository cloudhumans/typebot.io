import { describe, it, expect } from 'vitest'
import { WorkspaceRole } from '@typebot.io/prisma'
import {
  extractCognitoUserClaims,
  getUserWorkspaceNameFromCognito,
  mapCognitoRoleToWorkspaceRole,
} from './cognitoUtils'

describe('extractCognitoUserClaims', () => {
  it('should extract claims from direct user object', () => {
    const user = {
      'custom:hub_role': 'ADMIN',
      'custom:tenant_id': 'shopee',
    }

    const claims = extractCognitoUserClaims(user)

    expect(claims).toEqual({
      'custom:hub_role': 'ADMIN',
      'custom:tenant_id': 'shopee',
    })
  })

  it('should extract claims from nested token object', () => {
    const user = {
      token: {
        'custom:hub_role': 'MANAGER',
        'custom:tenant_id': 'shopee',
      },
    }

    const claims = extractCognitoUserClaims(user)

    expect(claims).toEqual({
      'custom:hub_role': 'MANAGER',
      'custom:tenant_id': 'shopee',
    })
  })

  it('should return undefined for null user', () => {
    const claims = extractCognitoUserClaims(null)
    expect(claims).toBeUndefined()
  })

  it('should return undefined for undefined user', () => {
    const claims = extractCognitoUserClaims(undefined)
    expect(claims).toBeUndefined()
  })

  it('should return undefined for empty user object', () => {
    const claims = extractCognitoUserClaims({})
    expect(claims).toBeUndefined()
  })

  it('should return undefined when missing hub_role', () => {
    const user = {
      'custom:tenant_id': 'shopee',
    }

    const claims = extractCognitoUserClaims(user)
    expect(claims).toBeUndefined()
  })

  it('should return undefined when missing tenant_id', () => {
    const user = {
      'custom:hub_role': 'ADMIN',
    }

    const claims = extractCognitoUserClaims(user)
    expect(claims).toBeUndefined()
  })

  it('should handle malformed user object gracefully', () => {
    const user = {
      'custom:hub_role': null,
      'custom:tenant_id': undefined,
    }

    const claims = extractCognitoUserClaims(user)
    expect(claims).toBeUndefined()
  })

  it('should handle nested token with missing claims', () => {
    const user = {
      token: {
        'custom:hub_role': 'ADMIN',
        // missing tenant_id
      },
    }

    const claims = extractCognitoUserClaims(user)
    expect(claims).toBeUndefined()
  })
})

describe('getUserWorkspaceNameFromCognito', () => {
  it('should return tenant_id from claims', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'shopee',
    }

    const workspaceName = getUserWorkspaceNameFromCognito(claims)
    expect(workspaceName).toBe('shopee')
  })

  it('should return undefined when tenant_id is missing', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
    }

    const workspaceName = getUserWorkspaceNameFromCognito(claims)
    expect(workspaceName).toBeUndefined()
  })
})

describe('mapCognitoRoleToWorkspaceRole', () => {
  it('should map ADMIN to ADMIN', () => {
    expect(mapCognitoRoleToWorkspaceRole('ADMIN')).toBe(WorkspaceRole.ADMIN)
  })

  it('should map MANAGER to ADMIN', () => {
    expect(mapCognitoRoleToWorkspaceRole('MANAGER')).toBe(WorkspaceRole.ADMIN)
  })

  it('should map CLIENT to MEMBER', () => {
    expect(mapCognitoRoleToWorkspaceRole('CLIENT')).toBe(WorkspaceRole.MEMBER)
  })

  it('should default unknown roles to MEMBER', () => {
    expect(mapCognitoRoleToWorkspaceRole('UNKNOWN')).toBe(WorkspaceRole.MEMBER)
  })

  it('should handle empty string', () => {
    expect(mapCognitoRoleToWorkspaceRole('')).toBe(WorkspaceRole.MEMBER)
  })

  it('should handle null/undefined gracefully', () => {
    expect(mapCognitoRoleToWorkspaceRole(null as unknown as string)).toBe(
      WorkspaceRole.MEMBER
    )
    expect(mapCognitoRoleToWorkspaceRole(undefined as unknown as string)).toBe(
      WorkspaceRole.MEMBER
    )
  })

  it('should be case sensitive', () => {
    expect(mapCognitoRoleToWorkspaceRole('admin')).toBe(WorkspaceRole.MEMBER)
    expect(mapCognitoRoleToWorkspaceRole('Admin')).toBe(WorkspaceRole.MEMBER)
  })
})
