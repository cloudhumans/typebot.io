import { MemberInWorkspace, User, WorkspaceRole } from '@typebot.io/prisma'
import { extractCognitoUserClaims, hasWorkspaceAccess } from './cognitoUtils'

export const isWriteWorkspaceForbidden = (
  workspace: {
    members: Pick<MemberInWorkspace, 'userId' | 'role'>[]
    name?: string
  },
  user: Pick<User, 'id'> & { cognitoClaims?: unknown }
) => {
  // Primary: Check Cognito token claims if workspace name is available
  if (workspace.name && user.cognitoClaims) {
    const cognitoClaims = extractCognitoUserClaims(user.cognitoClaims)
    if (cognitoClaims && cognitoClaims['custom:hub_role']) {
      if (hasWorkspaceAccess(cognitoClaims, workspace.name)) {
        // All Cognito roles (ADMIN/MEMBER) have write access
        return false
      }
    }
  }

  // Fallback: Check database members
  const userRole = workspace.members.find(
    (member) => member.userId === user.id
  )?.role
  return !userRole || userRole === WorkspaceRole.GUEST
}
