import { User } from '@typebot.io/prisma'

// Extend the base User type to include Cognito claims
export interface UserWithCognito extends User {
  cognitoClaims?: {
    'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
    'custom:tenant_id'?: string
  }
}

// Type for NextAuth JWT token with Cognito claims
export interface TokenWithCognito {
  userId?: string
  email?: string
  name?: string
  image?: string
  provider?: string
  cognitoClaims?: {
    'custom:hub_role'?: 'ADMIN' | 'CLIENT' | 'MANAGER'
    'custom:tenant_id'?: string
  }
}

// Type for NextAuth session with extended user
export interface SessionWithCognito {
  user: UserWithCognito
  expires: string
}
