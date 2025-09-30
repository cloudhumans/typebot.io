import { User } from '@typebot.io/prisma'

// Extend the base User type to include Cognito claims
export interface UserWithCognito extends User {
  cognitoClaims?: {
    'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
    'custom:tenant_id'?: string
    'custom:claudia_projects'?: string
  }
}

// Type for NextAuth JWT token with Cognito claims
export interface TokenWithCognito extends Record<string, unknown> {
  userId?: string
  email?: string
  name?: string
  image?: string
  provider?: string
  cognitoClaims?: {
    'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
    'custom:tenant_id'?: string
    'custom:claudia_projects'?: string
  }
}

// Type for NextAuth session with extended user
export interface SessionWithCognito {
  user: UserWithCognito
  expires: string
}
