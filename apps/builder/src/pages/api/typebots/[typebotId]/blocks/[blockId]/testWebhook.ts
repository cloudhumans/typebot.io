import {
  Typebot,
  Variable,
  HttpRequest,
  Block,
  AnswerInSessionState,
} from '@typebot.io/schemas'
import { NextApiRequest, NextApiResponse } from 'next'
import { byId } from '@typebot.io/lib'
import { isWebhookBlock } from '@typebot.io/schemas/helpers'
import { methodNotAllowed, notFound } from '@typebot.io/lib/api'
import prisma from '@typebot.io/lib/prisma'
import { getBlockById } from '@typebot.io/schemas/helpers'
import {
  executeWebhook,
  parseWebhookAttributes,
} from '@typebot.io/bot-engine/blocks/integrations/webhook/executeWebhookBlock'
import { isResolvedUrlSafe } from '@typebot.io/bot-engine/blocks/integrations/webhook/restApiCredential'
import { resolveRestApiCredentialData } from '@typebot.io/bot-engine/blocks/integrations/webhook/resolveRestApiCredential'
import { fetchLinkedChildTypebots } from '@typebot.io/bot-engine/blocks/logic/typebotLink/fetchLinkedChildTypebots'
import { parseSampleResult } from '@typebot.io/bot-engine/blocks/integrations/webhook/parseSampleResult'
import { saveLog } from '@typebot.io/bot-engine/logs/saveLog'
import { getAuthenticatedUser } from '@/features/auth/helpers/getAuthenticatedUser'
import { isReadWorkspaceFobidden } from '@/features/workspace/helpers/isReadWorkspaceFobidden'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const user = await getAuthenticatedUser(req, res)
    // This builder endpoint issues a server-side HTTP request, so it must not be
    // callable anonymously (the credential path additionally checks membership).
    if (!user)
      return res
        .status(401)
        .send({ statusCode: 401, data: { message: 'Unauthorized' } })
    const typebotId = req.query.typebotId as string
    const blockId = req.query.blockId as string
    const resultId = req.query.resultId as string | undefined
    const { variables } = (
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    ) as {
      variables: Variable[]
    }
    const typebot = (await prisma.typebot.findUnique({
      where: { id: typebotId },
      include: { webhooks: true },
    })) as unknown as (Typebot & { webhooks: HttpRequest[] }) | null
    if (!typebot) return notFound(res)
    const block = typebot.groups
      .flatMap<Block>((g) => g.blocks)
      .find(byId(blockId))
    if (!block || !isWebhookBlock(block))
      return notFound(res, 'Webhook block not found')
    const webhookId = 'webhookId' in block ? block.webhookId : undefined
    const webhook =
      block.options?.webhook ??
      typebot.webhooks.find((w) => {
        if ('id' in w) return w.id === webhookId
        return false
      })
    if (!webhook)
      return res
        .status(404)
        .send({ statusCode: 404, data: { message: `Couldn't find webhook` } })
    const { group } = getBlockById(blockId, typebot.groups)
    const linkedTypebots = await fetchLinkedChildTypebots({
      isPreview: !('typebotId' in typebot),
      typebots: [typebot],
      userId: user?.id,
    })([])

    const answers = arrayify(
      await parseSampleResult(typebot, linkedTypebots)(group.id, variables)
    )

    const rawCredentialsId =
      'options' in block ? block.options?.credentialsId : undefined
    // 'default' is the dropdown sentinel for "no credentials" — treat as absence.
    const credentialsId =
      rawCredentialsId && rawCredentialsId !== 'default'
        ? rawCredentialsId
        : undefined
    let credentialData
    if (credentialsId) {
      // Resolving a credential decrypts workspace secrets, so additionally
      // require the caller to be a member of the typebot's workspace.
      const workspace = await prisma.workspace.findFirst({
        where: { id: typebot.workspaceId },
        select: { id: true, members: true },
      })
      if (!workspace || isReadWorkspaceFobidden(workspace, user))
        return res
          .status(403)
          .send({ statusCode: 403, data: { message: 'Forbidden' } })
      credentialData = await resolveRestApiCredentialData({
        credentialsId,
        workspaceId: typebot.workspaceId,
      })
      if (!credentialData)
        return res.status(404).send({
          statusCode: 404,
          data: { message: `Referenced credential could not be resolved` },
        })
    }

    const parsedWebhook = await parseWebhookAttributes({
      webhook,
      isCustomBody: block.options?.isCustomBody,
      typebot: {
        ...typebot,
        typebotId: typebot.id,
        variables: typebot.variables.map((v) => {
          const matchingVariable = variables.find(byId(v.id))
          if (!matchingVariable) return v
          return { ...v, value: matchingVariable.value }
        }),
      },
      answers,
      credentialData: credentialData ?? undefined,
    })

    if (!parsedWebhook)
      return res.status(500).send({
        statusCode: 500,
        data: { message: `Couldn't parse webhook attributes` },
      })

    const urlSafety = isResolvedUrlSafe(parsedWebhook.url)
    if (!urlSafety.safe && (credentialData || urlSafety.reason !== 'Invalid URL'))
      return res.status(400).send({
        statusCode: 400,
        data: { message: `Request URL rejected: ${urlSafety.reason}` },
      })

    const { response, logs } = await executeWebhook(parsedWebhook, {
      timeout: block.options?.timeout,
    })

    if (resultId)
      await Promise.all(
        logs?.map((log) =>
          saveLog({
            message: log.description,
            details: log.details,
            status: log.status as 'error' | 'success' | 'info',
            resultId,
          })
        ) ?? []
      )

    return res.status(200).send(response)
  }
  return methodNotAllowed(res)
}

const arrayify = (
  obj: Record<string, string | boolean | undefined>
): AnswerInSessionState[] =>
  Object.entries(obj)
    .map(([key, value]) => ({ key, value: value?.toString() }))
    .filter((a) => a.value) as AnswerInSessionState[]

export default handler
