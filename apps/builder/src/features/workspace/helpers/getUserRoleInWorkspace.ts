import { WorkspaceRole } from '@typebot.io/prisma'
import logger from '@/helpers/logger'
import {
  CognitoUserClaims,
  extractCognitoUserClaims,
  mapCognitoRoleToWorkspaceRole,
  hasWorkspaceAccess,
} from './cognitoUtils'
import { WorkspaceMember } from '@typebot.io/schemas'

// Type for Prisma member objects with basic user info
type PrismaMemberWithUser = {
  userId: string
  role: WorkspaceRole
  workspaceId: string
  user: {
    name: string | null
    email: string | null
    image: string | null
  }
}

// Type for basic Prisma member objects without user relation
type BasicPrismaMember = {
  userId: string
  role: WorkspaceRole
  workspaceId: string
  createdAt: Date
  updatedAt: Date
}

const getRoleFromCognitoToken = (
  cognitoUser: CognitoUserClaims | undefined,
  workspaceName: string
): WorkspaceRole | undefined => {
  if (!cognitoUser) {
    return undefined
  }

  // Check if user has access to this workspace via tenant_id or claudia_projects (case-insensitive)
  if (hasWorkspaceAccess(cognitoUser, workspaceName)) {
    // If user has hub_role, use it to determine workspace role
    if (cognitoUser['custom:hub_role']) {
      const role = mapCognitoRoleToWorkspaceRole(cognitoUser['custom:hub_role'])
      return role
    }
    // If no hub_role but has workspace access, default to MEMBER
    return WorkspaceRole.MEMBER
  }

  return undefined
}

// Function overloads for different member types
export function getUserRoleInWorkspace(
  userId: string,
  workspaceMembers: WorkspaceMember[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined

export function getUserRoleInWorkspace(
  userId: string,
  workspaceMembers: PrismaMemberWithUser[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined

export function getUserRoleInWorkspace(
  userId: string,
  workspaceMembers: BasicPrismaMember[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined

// Implementation
export function getUserRoleInWorkspace(
  userId: string,
  workspaceMembers:
    | WorkspaceMember[]
    | PrismaMemberWithUser[]
    | BasicPrismaMember[]
    | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined {
  // Primary: Check Cognito token claims if workspace name is provided
  if (workspaceName && user) {
    const cognitoUser = extractCognitoUserClaims(user)
    logger.info('cognito user', cognitoUser)
    if (cognitoUser) {
      const tokenRole = getRoleFromCognitoToken(cognitoUser, workspaceName)

      if (tokenRole) {
        logger.info('User authenticated via Cognito token', {
          workspace: workspaceName,
          role: tokenRole,
          userId,
        })
        return tokenRole
      }
    }
  }

  // Fallback: Use existing database-based approach
  const dbMember = workspaceMembers?.find((member) => member.userId === userId)
  if (dbMember) {
    logger.info('User authenticated via database', {
      userId,
      role: dbMember.role,
      workspace: workspaceName || 'not specified',
    })
  }
  return dbMember?.role
}
