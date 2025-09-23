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
  console.log('🔍 getRoleFromCognitoToken Debug:')
  console.log('  cognitoUser:', cognitoUser)
  console.log('  workspaceName:', workspaceName)

  if (!cognitoUser?.['custom:tenant_id'] || !cognitoUser?.['custom:hub_role']) {
    console.log('  ❌ Missing tenant_id or hub_role')
    return undefined
  }

  console.log('  Comparing tenant_id vs workspaceName:')
  console.log('    tenant_id:', `"${cognitoUser['custom:tenant_id']}"`)
  console.log('    workspaceName:', `"${workspaceName}"`)
  console.log('    Match:', cognitoUser['custom:tenant_id'] === workspaceName)

  // Check if user has access to this workspace via tenant_id matching workspace name
  if (cognitoUser['custom:tenant_id'] === workspaceName) {
    const mappedRole = mapCognitoRoleToWorkspaceRole(
      cognitoUser['custom:hub_role']
    )
    console.log('  ✅ Tenant match! Hub role:', cognitoUser['custom:hub_role'])
    console.log('  ✅ Mapped role:', mappedRole)
    return mappedRole
  }

  console.log('  ❌ Tenant does not match workspace name')
  return undefined
}

export const getUserRoleInWorkspace = (
  userId: string,
  workspaceMembers: MemberInWorkspace[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined => {
  console.log('🔍 getUserRoleInWorkspace Debug:')
  console.log('  userId:', userId)
  console.log('  workspaceName:', workspaceName)
  console.log('  user provided:', !!user)
  console.log('  workspaceMembers count:', workspaceMembers?.length || 0)

  // Primary: Check Cognito token claims if workspace name is provided
  if (workspaceName && user) {
    console.log('  Attempting Cognito authentication...')
    const cognitoUser = extractCognitoUserClaims(user)
    console.log('  Extracted cognitoUser:', cognitoUser)

    if (cognitoUser) {
      const tokenRole = getRoleFromCognitoToken(cognitoUser, workspaceName)
      console.log('  Cognito token role:', tokenRole)

      if (tokenRole) {
        console.log('  ✅ Cognito authentication successful, role:', tokenRole)
        return tokenRole
      }
    }
  }

  // Fallback: Use existing database-based approach
  console.log('  Falling back to database authentication...')
  const dbMember = workspaceMembers?.find((member) => member.userId === userId)
  console.log('  Database member found:', !!dbMember)
  console.log('  Database member role:', dbMember?.role)

  const finalRole = dbMember?.role
  console.log('  Final role:', finalRole)

  return finalRole
}
