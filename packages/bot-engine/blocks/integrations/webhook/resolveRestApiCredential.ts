import { RestApiCredentials } from '@typebot.io/schemas'
import prisma from '@typebot.io/lib/prisma'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'

/**
 * Fetches and decrypts a rest-api credential, scoped to the executing
 * workspace. Returns null when no matching credential exists (wrong workspace,
 * deleted, wrong type) or when decryption fails — callers must abort the block
 * in that case.
 *
 * Kept separate from the pure helpers in `restApiCredential.ts` so those remain
 * importable (and unit-testable) without pulling in Prisma / env validation.
 */
export const resolveRestApiCredentialData = async ({
  credentialsId,
  workspaceId,
}: {
  credentialsId: string
  workspaceId: string | undefined
}): Promise<RestApiCredentials['data'] | null> => {
  if (!workspaceId) return null
  const credential = await prisma.credentials.findFirst({
    where: { id: credentialsId, workspaceId, type: 'rest-api' },
  })
  if (!credential) return null
  try {
    return (await decrypt(
      credential.data,
      credential.iv
    )) as RestApiCredentials['data']
  } catch {
    // Corrupted payload / missing ENCRYPTION_SECRET — fail closed so the caller
    // aborts the block in a controlled way rather than throwing.
    return null
  }
}
