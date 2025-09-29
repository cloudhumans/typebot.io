import { MemberInWorkspace, User, WorkspaceRole } from '@typebot.io/prisma'
import {
  extractCognitoUserClaims,
  hasWorkspaceAccess,
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
    if (cognitoClaims && hasWorkspaceAccess(cognitoClaims, workspace.name)) {
      if (cognitoClaims['custom:hub_role']) {
        // Use the specific hub_role to determine admin access
        const role = mapCognitoRoleToWorkspaceRole(
          cognitoClaims['custom:hub_role']
        )
        return role !== WorkspaceRole.ADMIN
      } else {
        // No hub_role but has workspace access via other means (e.g., claudia_projects)
        // Default to MEMBER role (not admin)
        return true
      }
    }
  }

  // Fallback: Check database members
  const userRole = workspace.members.find(
    (member) => member.userId === user.id
  )?.role
  return !userRole || userRole !== WorkspaceRole.ADMIN
}
