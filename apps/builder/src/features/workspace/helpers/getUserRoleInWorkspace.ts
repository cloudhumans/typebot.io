import { MemberInWorkspace, WorkspaceRole } from '@typebot.io/prisma'
import {
  CognitoUserClaims,
  extractCognitoUserClaims,
  mapCognitoRoleToWorkspaceRole,
} from './cognitoUtils'

const getRoleFromCognitoToken = (
  cognitoUser: CognitoUserClaims | undefined,
  workspaceName: string
): WorkspaceRole | undefined => {
  if (!cognitoUser?.['custom:tenant_id'] || !cognitoUser?.['custom:hub_role']) {
    return undefined
  }

  // Check if user has access to this workspace via tenant_id matching workspace name
  if (cognitoUser['custom:tenant_id'] === workspaceName) {
    return mapCognitoRoleToWorkspaceRole(cognitoUser['custom:hub_role'])
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
        console.log(`✅ User authenticated via Cognito token for workspace "${workspaceName}" with role: ${tokenRole}`)
        return tokenRole
      }
    }
  }

  // Fallback: Use existing database-based approach
  const dbMember = workspaceMembers?.find((member) => member.userId === userId)
  if (dbMember) {
    console.log(`✅ User authenticated via database for userId "${userId}" with role: ${dbMember.role}`)
  }
  return dbMember?.role
}
