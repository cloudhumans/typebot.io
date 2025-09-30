import { env } from '@typebot.io/env'
import { MemberInWorkspace, User } from '@typebot.io/prisma'
import { extractCognitoUserClaims, hasWorkspaceAccess } from './cognitoUtils'

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
    const cognitoClaims = extractCognitoUserClaims(user)

    if (cognitoClaims && hasWorkspaceAccess(cognitoClaims, workspace.name)) {
      return false
    }
  }

  // Fallback: Check database members
  const dbMember = workspace.members.find((member) => member.userId === user.id)

  if (dbMember) {
    return false
  }

  return true
}
