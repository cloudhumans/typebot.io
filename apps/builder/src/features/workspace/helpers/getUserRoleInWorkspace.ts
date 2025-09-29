import { MemberInWorkspace, WorkspaceRole } from '@typebot.io/prisma'
import logger from '@/helpers/logger'
import {
  CognitoUserClaims,
  extractCognitoUserClaims,
  mapCognitoRoleToWorkspaceRole,
  hasWorkspaceAccess,
} from './cognitoUtils'

const getRoleFromCognitoToken = (
  cognitoUser: CognitoUserClaims | undefined,
  workspaceName: string
): WorkspaceRole | undefined => {
  if (!cognitoUser?.['custom:hub_role']) {
    return undefined
  }

  // Check if user has access to this workspace via tenant_id or claudia_projects (case-insensitive)
  if (hasWorkspaceAccess(cognitoUser, workspaceName)) {
    const role = mapCognitoRoleToWorkspaceRole(cognitoUser['custom:hub_role'])
    return role
  }

  return undefined
}

export const getUserRoleInWorkspace = (
  userId: string,
  workspaceMembers: MemberInWorkspace[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined => {
  // Primary: Check Cognito token claims if workspace name is provided
  if (workspaceName && user) {
    const cognitoUser = extractCognitoUserClaims(user)

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
      workspace: 'not specified',
    })
  }
  return dbMember?.role
}
