import { publicProcedure } from '@/helpers/server/trpc'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { env } from '@typebot.io/env'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'

export const verifyEmbeddedToken = publicProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ input }) => {
    try {
      const payload = await verifyCognitoToken({
        cognitoAppClientId: env.CLOUDCHAT_COGNITO_APP_CLIENT_ID,
        cognitoIssuerUrl: env.COGNITO_ISSUER_URL,
        cognitoToken: input.token,
      })
      return { email: payload.email }
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      })
    }
  })
