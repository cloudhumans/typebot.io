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
  console.log('🔍 isReadWorkspaceForbidden Debug:')
  console.log('  workspace.name:', workspace.name)
  console.log('  user.id:', user.id)
  console.log('  user.email:', user.email)
  console.log('  user.cognitoClaims:', user.cognitoClaims)
  console.log('  workspace members count:', workspace.members.length)

  // Admin email check (highest priority)
  if (env.ADMIN_EMAIL?.some((email) => email === user.email)) {
    console.log('  ✅ Admin email access granted')
    return false
  }

  // Primary: Check Cognito token claims if workspace name is available
  if (workspace.name && user.cognitoClaims) {
    console.log('  Attempting Cognito workspace access check...')
    const cognitoClaims = extractCognitoUserClaims(user.cognitoClaims)
    console.log('  Extracted cognitoClaims:', cognitoClaims)

    if (cognitoClaims) {
      const userWorkspaceName = getUserWorkspaceNameFromCognito(cognitoClaims)
      console.log('  User workspace from Cognito:', userWorkspaceName)
      console.log('  Workspace name:', workspace.name)
      console.log(
        '  Workspace names match:',
        userWorkspaceName === workspace.name
      )

      if (userWorkspaceName === workspace.name) {
        console.log('  ✅ Cognito workspace access granted')
        return false
      }
    }
  }

  // Fallback: Check database members
  console.log('  Checking database membership...')
  const dbMember = workspace.members.find((member) => member.userId === user.id)
  console.log('  Database member found:', !!dbMember)

  if (dbMember) {
    console.log('  ✅ Database membership access granted')
    return false
  }

  console.log('  ❌ Access forbidden')
  return true
}
