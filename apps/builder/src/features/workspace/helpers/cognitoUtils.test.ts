import { describe, it, expect } from 'vitest'
import { WorkspaceRole } from '@typebot.io/prisma'
import {
  extractCognitoUserClaims,
  getUserWorkspaceNameFromCognito,
  mapCognitoRoleToWorkspaceRole,
  hasWorkspaceAccess,
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

  it('should extract claims including undefined claudia_projects when field exists', () => {
    const user = {
      'custom:hub_role': 'ADMIN',
      'custom:tenant_id': 'shopee',
      'custom:claudia_projects': undefined,
    }

    const claims = extractCognitoUserClaims(user)

    expect(claims).toEqual({
      'custom:hub_role': 'ADMIN',
      'custom:tenant_id': 'shopee',
      'custom:claudia_projects': undefined,
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

describe('hasWorkspaceAccess', () => {
  it('should return true when tenant_id matches workspace name (case-insensitive)', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'Shopee',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(true)
    expect(hasWorkspaceAccess(claims, 'SHOPEE')).toBe(true)
    expect(hasWorkspaceAccess(claims, 'ShOpEe')).toBe(true)
  })

  it('should return true when claudia_projects contains workspace name (case-insensitive)', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'different-tenant',
      'custom:claudia_projects': 'Project1,Shopee,Project3',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(true)
    expect(hasWorkspaceAccess(claims, 'SHOPEE')).toBe(true)
    expect(hasWorkspaceAccess(claims, 'ShOpEe')).toBe(true)
  })

  it('should return true when claudia_projects contains workspace name with extra spaces', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'different-tenant',
      'custom:claudia_projects': ' Project1 , Shopee , Project3 ',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(true)
  })

  it('should return false when neither tenant_id nor claudia_projects match', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'different-tenant',
      'custom:claudia_projects': 'Project1,Project2,Project3',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(false)
  })

  it('should return false when workspace name is empty', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'shopee',
    }

    expect(hasWorkspaceAccess(claims, '')).toBe(false)
  })

  it('should return false when no tenant_id or claudia_projects are provided', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(false)
  })

  it('should handle single project in claudia_projects', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'different-tenant',
      'custom:claudia_projects': 'Shopee',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(true)
  })

  it('should prioritize tenant_id match over claudia_projects', () => {
    const claims = {
      'custom:hub_role': 'ADMIN' as const,
      'custom:tenant_id': 'Shopee',
      'custom:claudia_projects': 'OtherProject',
    }

    expect(hasWorkspaceAccess(claims, 'shopee')).toBe(true)
  })
})
