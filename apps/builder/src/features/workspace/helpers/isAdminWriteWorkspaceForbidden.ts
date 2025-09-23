import { MemberInWorkspace, User, WorkspaceRole } from '@typebot.io/prisma'
import {
  extractCognitoUserClaims,
  getUserWorkspaceNameFromCognito,
  mapCognitoRoleToWorkspaceRole,
} from './cognitoUtils'

export const isAdminWriteWorkspaceForbidden = (
  workspace: {
    members: Pick<MemberInWorkspace, 'role' | 'userId'>[]
    name?: string
  },
  user: Pick<User, 'email' | 'id'> & { cognitoClaims?: unknown }
) => {
  // Primary: Check Cognito token claims if workspace name is available
  if (workspace.name && user.cognitoClaims) {
    const cognitoClaims = extractCognitoUserClaims(user.cognitoClaims)
    if (cognitoClaims) {
      const userWorkspaceName = getUserWorkspaceNameFromCognito(cognitoClaims)
      if (
        userWorkspaceName === workspace.name &&
        cognitoClaims['custom:hub_role']
      ) {
        const role = mapCognitoRoleToWorkspaceRole(
          cognitoClaims['custom:hub_role']
        )
        return role !== WorkspaceRole.ADMIN
      }
    }
  }

  // Fallback: Check database members
  const userRole = workspace.members.find(
    (member) => member.userId === user.id
  )?.role
  return !userRole || userRole !== WorkspaceRole.ADMIN
}
