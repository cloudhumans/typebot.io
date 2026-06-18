/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ResultValues,
  Typebot,
  Variable,
  HttpRequest,
  Block,
  PublicTypebot,
  AnswerInSessionState,
  RestApiCredentials,
} from '@typebot.io/schemas'
import { NextApiRequest, NextApiResponse } from 'next'
import { byId } from '@typebot.io/lib'
import { isWebhookBlock } from '@typebot.io/schemas/helpers'
import { initMiddleware, methodNotAllowed, notFound } from '@typebot.io/lib/api'
import Cors from 'cors'
import prisma from '@typebot.io/lib/prisma'
import { getBlockById } from '@typebot.io/schemas/helpers'
import {
  executeWebhook,
  parseWebhookAttributes,
} from '@typebot.io/bot-engine/blocks/integrations/webhook/executeWebhookBlock'
import { resolveRestApiCredentialData } from '@typebot.io/bot-engine/blocks/integrations/webhook/resolveRestApiCredential'
import { isResolvedUrlSafe } from '@typebot.io/bot-engine/blocks/integrations/webhook/restApiCredential'
import { fetchLinkedParentTypebots } from '@typebot.io/bot-engine/blocks/logic/typebotLink/fetchLinkedParentTypebots'
import { fetchLinkedChildTypebots } from '@typebot.io/bot-engine/blocks/logic/typebotLink/fetchLinkedChildTypebots'
import { parseSampleResult } from '@typebot.io/bot-engine/blocks/integrations/webhook/parseSampleResult'
import { saveLog } from '@typebot.io/bot-engine/logs/saveLog'
import { authenticateUser } from '@/helpers/authenticateUser'

const cors = initMiddleware(Cors())

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await cors(req, res)
  if (req.method === 'POST') {
    const user = await authenticateUser(req)
    const typebotId = req.query.typebotId as string
    const blockId = req.query.blockId as string
    const resultId = req.query.resultId as string | undefined
    const { resultValues, variables, parentTypebotIds } = (
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    ) as {
      resultValues: ResultValues
      variables: Variable[]
      parentTypebotIds: string[]
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
    const linkedTypebotsParents = (await fetchLinkedParentTypebots({
      isPreview: !('typebotId' in typebot),
      parentTypebotIds,
      userId: user?.id,
    })) as (Typebot | PublicTypebot)[]
    const linkedTypebotsChildren = await fetchLinkedChildTypebots({
      isPreview: !('typebotId' in typebot),
      typebots: [typebot],
      userId: user?.id,
    })([])

    const linkedTypebots = [...linkedTypebotsParents, ...linkedTypebotsChildren]

    const answers = resultValues
      ? resultValues.answers.map((answer: any) => ({
          key:
            (answer.variableId
              ? typebot.variables.find(
                  (variable) => variable.id === answer.variableId
                )?.name
              : typebot.groups.find((group) =>
                  group.blocks.find((block) => block.id === answer.blockId)
                )?.title) ?? '',
          value: answer.content,
        }))
      : arrayify(
          await parseSampleResult(typebot, linkedTypebots)(group.id, variables)
        )

    // Resolve a workspace-scoped rest-api credential when the block references
    // one, mirroring the bot-engine path so this endpoint stays consistent
    // (credential merging, masking and the SSRF guard all apply here too).
    const rawCredentialsId = (block.options as { credentialsId?: string })
      ?.credentialsId
    const credentialsId =
      rawCredentialsId && rawCredentialsId !== 'default'
        ? rawCredentialsId
        : undefined
    let credentialData: RestApiCredentials['data'] | undefined
    if (credentialsId) {
      credentialData =
        (await resolveRestApiCredentialData({
          credentialsId,
          workspaceId: typebot.workspaceId,
        })) ?? undefined
      if (!credentialData)
        return res.status(400).send({
          statusCode: 400,
          data: { message: `Referenced credential could not be resolved.` },
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
      credentialData,
    })

    if (!parsedWebhook)
      return res.status(500).send({
        statusCode: 500,
        data: { message: `Couldn't parse webhook attributes` },
      })

    // Validate the resolved URL (post-interpolation). Genuinely unsafe URLs
    // (bad scheme / metadata host) are blocked for every block; parse failures
    // only abort credentialed ones, matching the bot-engine path and avoiding
    // regressions for legacy flows whose URLs `ky` tolerates but `new URL()`
    // does not.
    const urlSafety = isResolvedUrlSafe(parsedWebhook.url)
    if (
      !urlSafety.safe &&
      (credentialData || urlSafety.reason !== 'Invalid URL')
    )
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
