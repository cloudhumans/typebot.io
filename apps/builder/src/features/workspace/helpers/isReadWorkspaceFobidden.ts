import { env } from '@typebot.io/env'
import { MemberInWorkspace, User } from '@typebot.io/prisma'
import {
  extractCognitoUserClaims,
  getUserWorkspaceNameFromCognito,
} from './cognitoUtils'

export const isReadWorkspaceFobidden = (
  workspace: {
    members: Pick<MemberInWorkspace, 'userId'>[]
    name?: string
  },
  user: Pick<User, 'email' | 'id'> & { cognitoClaims?: unknown }
) => {
  // Admin email check (highest priority)
  if (env.ADMIN_EMAIL?.some((email) => email === user.email)) {
    return false
  }

  // Primary: Check Cognito token claims if workspace name is available
  if (workspace.name && user.cognitoClaims) {
    const cognitoClaims = extractCognitoUserClaims(user.cognitoClaims)

    if (cognitoClaims) {
      const userWorkspaceName = getUserWorkspaceNameFromCognito(cognitoClaims)

      if (userWorkspaceName === workspace.name) {
        console.log(
          `✅ Workspace access granted via Cognito token for workspace "${workspace.name}"`
        )
        return false
      }
    }
  }

  // Fallback: Check database members
  const dbMember = workspace.members.find((member) => member.userId === user.id)

  if (dbMember) {
    console.log(
      `✅ Workspace access granted via database membership for workspace "${
        workspace.name || 'unnamed'
      }"`
    )
    return false
  }

  return true
}
