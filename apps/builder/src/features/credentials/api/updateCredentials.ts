import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { isAdminWriteWorkspaceForbidden } from '@/features/workspace/helpers/isAdminWriteWorkspaceForbidden'
import { findCredentialsUsages } from '@typebot.io/lib/credentials/findCredentialsUsages'
import logger from '@typebot.io/lib/logger'
import { encrypt } from '@typebot.io/lib/api/encryption/encrypt'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'
import { restApiCredentialsSchema } from '@typebot.io/schemas/features/blocks/integrations/webhook/schema'
import { maskedValue } from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'
import { RestApiCredentials } from '@typebot.io/schemas'

type KeyValue = { key: string; value: string }

const normalizeEntries = (entries?: KeyValue[]): KeyValue[] =>
  (entries ?? []).map((e) => ({ key: e.key, value: e.value }))

// Incoming secret values arrive masked (`••••••••`) for any row the user did not
// retype. For those, restore the prior value matched by key so saving without
// editing a secret never overwrites it with the mask. A masked row whose key has
// no prior match (e.g. a key renamed while leaving the value untouched) cannot be
// resolved — reject it so we never persist the literal sentinel.
export const mergeMaskedSecrets = (
  incoming: KeyValue[] | undefined,
  existing: KeyValue[] | undefined
): KeyValue[] => {
  const priorByKey = new Map((existing ?? []).map((e) => [e.key, e.value]))
  return (incoming ?? []).map((item) => {
    if (item.value !== maskedValue) return item
    const prior = priorByKey.get(item.key)
    if (prior === undefined)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Re-enter the value for "${item.key}" — its secret could not be preserved.`,
      })
    return { key: item.key, value: prior }
  })
}

export const updateCredentials = authenticatedProcedure
  .meta({
    openapi: {
      method: 'PATCH',
      path: '/v1/credentials/:credentialsId',
      protect: true,
      summary: 'Update credentials',
      tags: ['Credentials'],
    },
  })
  .input(
    z.object({
      credentialsId: z.string(),
      workspaceId: z.string(),
      name: z.string().trim().min(1).optional(),
      data: restApiCredentialsSchema.shape.data.optional(),
      // undefined = leave deprecation untouched; true = deprecate; false = reactivate.
      deprecated: z.boolean().optional(),
      // Acknowledge that request-affecting changes (baseUrl/headers/queryParams)
      // take effect immediately in published flows. Mirrors delete's `force`.
      confirmed: z.boolean().optional(),
      currentTypebotId: z.string().optional(),
    })
  )
  .output(z.object({ credentialsId: z.string() }))
  .mutation(
    async ({
      input: { credentialsId, workspaceId, name, data, deprecated, confirmed },
      ctx: { user },
    }) => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, members: true },
      })
      if (!workspace || isWriteWorkspaceForbidden(workspace, user))
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        })

      const existing = await prisma.credentials.findFirst({
        where: { id: credentialsId, workspaceId },
        select: { type: true, data: true, iv: true, deprecatedAt: true },
      })
      if (!existing)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Credentials not found',
        })

      // Editing is exposed only for REST API credentials, which are admin-managed;
      // match the create/delete admin bar so a non-admin can't rewrite a secret.
      if (existing.type !== 'rest-api')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only REST API credentials can be edited',
        })
      if (isAdminWriteWorkspaceForbidden(workspace, user))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only workspace admins can edit REST API credentials',
        })

      // Only decrypt when secret data is actually being edited — a name-only or
      // deprecation-only save needs no access to the existing payload.
      let mergedData:
        | {
            baseUrl: string
            headers: { key: string; value: string }[]
            queryParams: { key: string; value: string }[]
          }
        | undefined
      let dataChanged = false
      if (data) {
        const existingData = (await decrypt(
          existing.data,
          existing.iv
        )) as RestApiCredentials['data']
        mergedData = {
          baseUrl: data.baseUrl.trim(),
          headers: mergeMaskedSecrets(data.headers, existingData.headers),
          queryParams: mergeMaskedSecrets(
            data.queryParams,
            existingData.queryParams
          ),
        }
        dataChanged =
          JSON.stringify({
            baseUrl: mergedData.baseUrl,
            headers: normalizeEntries(mergedData.headers),
            queryParams: normalizeEntries(mergedData.queryParams),
          }) !==
          JSON.stringify({
            baseUrl: existingData.baseUrl,
            headers: normalizeEntries(existingData.headers),
            queryParams: normalizeEntries(existingData.queryParams),
          })
      }

      // Deprecation is non-destructive: preserve the original timestamp when an
      // already-deprecated credential is re-saved, only stamping/clearing on a
      // real state transition.
      const deprecatedAt =
        deprecated === undefined
          ? undefined
          : deprecated
          ? existing.deprecatedAt ?? new Date()
          : null
      const deprecationChanged =
        deprecated !== undefined && !!existing.deprecatedAt !== deprecated

      await prisma.$transaction(
        async (tx) => {
          // A request-affecting change (URL/headers/params) hits published flows
          // immediately, since the credential is fetched fresh per execution.
          // Surface those usages so the client can confirm before persisting.
          // Name-only or deprecation-only edits don't alter outgoing requests.
          if (dataChanged) {
            const usages = await findCredentialsUsages(
              credentialsId,
              workspaceId,
              tx
            )
            const publishedUsages = usages.filter(
              (u) => u.source === 'PublicTypebot' || u.via === 'whatsApp'
            )
            if (publishedUsages.length > 0 && !confirmed)
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: `Credential used by ${publishedUsages.length} published flow(s). Changes apply immediately in production.`,
                cause: { _credentialInUse: true, usages: publishedUsages },
              })
            if (usages.length > 0)
              logger.warn('Editing credential referenced by flows', {
                code: 'credential_updated_in_use',
                credentialsId,
                workspaceId,
                userId: user.id,
                usageCount: usages.length,
                publishedCount: publishedUsages.length,
                confirmed: !!confirmed,
              })
          }

          const encrypted = mergedData ? await encrypt(mergedData) : undefined

          await tx.credentials.update({
            where: { id: credentialsId },
            data: {
              ...(name !== undefined ? { name } : {}),
              ...(encrypted
                ? { data: encrypted.encryptedData, iv: encrypted.iv }
                : {}),
              ...(deprecatedAt !== undefined ? { deprecatedAt } : {}),
            },
          })

          if (deprecationChanged)
            logger.warn(
              deprecated
                ? 'Credential marked as deprecated'
                : 'Credential reactivated',
              {
                code: deprecated
                  ? 'credential_deprecated'
                  : 'credential_undeprecated',
                credentialsId,
                workspaceId,
                userId: user.id,
              }
            )
        },
        { isolationLevel: 'RepeatableRead' }
      )

      return { credentialsId }
    }
  )
