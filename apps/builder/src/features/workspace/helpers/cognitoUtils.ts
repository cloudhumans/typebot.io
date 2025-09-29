import { WorkspaceRole } from '@typebot.io/prisma'
import logger from '@/helpers/logger'

export interface CognitoUserClaims {
  'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
  'custom:tenant_id'?: string
  'custom:claudia_projects'?: string
}

export const extractCognitoUserClaims = (
  user: unknown
): CognitoUserClaims | undefined => {
  if (typeof user !== 'object' || user === null) {
    return undefined
  }

  const userObj = user as Record<string, unknown>

  // Extract claims directly from the user object (Pattern 2 is the only one used in production)
  if (
    'custom:hub_role' in userObj &&
    'custom:tenant_id' in userObj &&
    userObj['custom:hub_role'] &&
    userObj['custom:tenant_id']
  ) {
    const result: CognitoUserClaims = {
      'custom:hub_role': userObj['custom:hub_role'] as
        | 'ADMIN'
        | 'CLIENT'
        | 'MANAGER',
      'custom:tenant_id': userObj['custom:tenant_id'] as string,
    }
    if ('custom:claudia_projects' in userObj) {
      result['custom:claudia_projects'] = userObj['custom:claudia_projects'] as
        | string
        | undefined
    }
    return result
  }

  return undefined
}

export const getUserWorkspaceNameFromCognito = (
  claims: CognitoUserClaims
): string | undefined => {
  return claims['custom:tenant_id'] || undefined
}

export const hasWorkspaceAccess = (
  claims: CognitoUserClaims,
  workspaceName: string
): boolean => {
  if (!workspaceName) {
    return false
  }

  const workspaceNameLower = workspaceName.toLowerCase()

  // Check tenant_id match (case-insensitive)
  if (claims['custom:tenant_id']) {
    const tenantIdLower = claims['custom:tenant_id'].toLowerCase()
    if (tenantIdLower === workspaceNameLower) {
      logger.info('WorkspaceAccess match found via tenant_id', {
        tenantId: claims['custom:tenant_id'],
        workspace: workspaceName,
      })
      return true
    }
  }

  // Check claudia_projects match (case-insensitive)
  // claudia_projects is expected to be a comma-separated string of project names
  if (claims['custom:claudia_projects']) {
    const projectsLower = claims['custom:claudia_projects']
      .toLowerCase()
      .split(',')
      .map((project) => project.trim())

    if (projectsLower.includes(workspaceNameLower)) {
      logger.info('WorkspaceAccess match found via claudia_projects', {
        claudiaProjects: claims['custom:claudia_projects'],
        workspace: workspaceName,
      })
      return true
    }
  }

  return false
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
