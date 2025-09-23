import { env } from '@typebot.io/env'
import {
  CollaboratorsOnTypebots,
  User,
  Workspace,
  MemberInWorkspace,
  Typebot,
} from '@typebot.io/prisma'
import { settingsSchema } from '@typebot.io/schemas'
import { isReadWorkspaceFobidden } from '@/features/workspace/helpers/isReadWorkspaceFobidden'

export const isReadTypebotForbidden = async (
  typebot: {
    settings?: Typebot['settings']
    collaborators: Pick<CollaboratorsOnTypebots, 'userId'>[]
  } & {
    workspace: Pick<Workspace, 'isSuspended' | 'isPastDue'> & {
      members: Pick<MemberInWorkspace, 'userId'>[]
    } & {
      name?: string
    }
  },
  user?: Pick<User, 'email' | 'id'> & { cognitoClaims?: unknown }
) => {
  console.log('🔍 isReadTypebotForbidden Debug:')
  console.log('  user:', user?.id, user?.email)
  console.log('  user.cognitoClaims:', user?.cognitoClaims)
  console.log('  workspace.name:', typebot.workspace.name)
  console.log('  workspace.isSuspended:', typebot.workspace.isSuspended)
  console.log('  workspace.isPastDue:', typebot.workspace.isPastDue)
  console.log('  collaborators count:', typebot.collaborators.length)
  console.log('  workspace members count:', typebot.workspace.members.length)

  const settings = typebot.settings
    ? settingsSchema.parse(typebot.settings)
    : undefined
  const isTypebotPublic = settings?.publicShare?.isEnabled === true
  console.log('  isTypebotPublic:', isTypebotPublic)

  if (isTypebotPublic) {
    console.log('  ✅ Public typebot - access granted')
    return false
  }

  if (!user) {
    console.log('  ❌ No user - access denied')
    return true
  }

  if (typebot.workspace.isSuspended || typebot.workspace.isPastDue) {
    console.log('  ❌ Workspace suspended/past due - access denied')
    return true
  }

  // Check if user is admin
  if (env.ADMIN_EMAIL?.some((email) => email === user.email)) {
    console.log('  ✅ Admin user - access granted')
    return false
  }

  // Check if user is a collaborator on this specific typebot
  const isCollaborator = typebot.collaborators.some(
    (collaborator) => collaborator.userId === user.id
  )
  console.log('  isCollaborator:', isCollaborator)
  if (isCollaborator) {
    console.log('  ✅ User is collaborator - access granted')
    return false
  }

  // Use hybrid workspace access control (Cognito + database)
  console.log('  Checking workspace access via hybrid system...')
  const workspaceAccessDenied = isReadWorkspaceFobidden(typebot.workspace, user)
  console.log('  Workspace access denied:', workspaceAccessDenied)

  if (!workspaceAccessDenied) {
    console.log('  ✅ Workspace access granted via hybrid system')
  } else {
    console.log('  ❌ Workspace access denied via hybrid system')
  }

  return workspaceAccessDenied
}
