import {
  HttpRequestBlock,
  ZapierBlock,
  MakeComBlock,
  PabblyConnectBlock,
  SessionState,
  HttpRequest,
  Variable,
  HttpResponse,
  KeyValue,
  ChatLog,
  ExecutableHttpRequest,
  AnswerInSessionState,
  TypebotInSession,
} from '@typebot.io/schemas'
import { stringify } from 'qs'
import { isDefined, isEmpty, isNotDefined, omit } from '@typebot.io/lib'
import ky, { HTTPError, Options, TimeoutError } from 'ky'
import { resumeWebhookExecution } from './resumeWebhookExecution'
import { ExecuteIntegrationResponse } from '../../../types'
import { parseVariables } from '@typebot.io/variables/parseVariables'
import prisma from '@typebot.io/lib/prisma'
import {
  HttpMethod,
  defaultTimeout,
  defaultWebhookAttributes,
  maxTimeout,
} from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'
import { env } from '@typebot.io/env'
import { parseAnswers } from '@typebot.io/results/parseAnswers'
import logger from '@typebot.io/lib/logger'
import { RestApiCredentials } from '@typebot.io/schemas'
import {
  addMaskableSecret,
  cleanUrlConcat,
  isResolvedUrlSafe,
  isSensitiveHeaderKey,
  maskSecretsDeep,
  mergeKeyValues,
} from './restApiCredential'
import { resolveRestApiCredentialData } from './resolveRestApiCredential'
import { parseResponseBody, safeJsonParse } from './parseResponseBody'

type ParsedWebhook = ExecutableHttpRequest & {
  basicAuth: { username?: string; password?: string }
  isJson: boolean
  secretValues?: Set<string>
}

export const longReqTimeoutWhitelist = [
  'https://api.openai.com',
  'https://retune.so',
  'https://www.chatbase.co',
  'https://channel-connector.orimon.ai',
  'https://api.anthropic.com',
]

export const webhookSuccessDescription = `Webhook successfuly executed.`
export const webhookErrorDescription = `Webhook returned an error.`

type Params = {
  disableRequestTimeout?: boolean
  timeout?: number
  sessionId?: string
}

type LogContext = {
  workspace: { id: string; name: string }
  workflow: {
    id: string
    name: string
    schema_version: string
    execution_id: string
    version_id: string
  }
}

export const executeWebhookBlock = async (
  state: SessionState,
  block: HttpRequestBlock | ZapierBlock | MakeComBlock | PabblyConnectBlock,
  params: Params = {}
): Promise<ExecuteIntegrationResponse> => {
  const logs: ChatLog[] = []
  const webhook =
    block.options?.webhook ??
    ('webhookId' in block
      ? ((await prisma.webhook.findUnique({
          where: { id: block.webhookId },
        })) as HttpRequest | null)
      : null)
  if (!webhook) return { outgoingEdgeId: block.outgoingEdgeId }

  const rawCredentialsId =
    'options' in block ? block.options?.credentialsId : undefined
  // 'default' is the dropdown sentinel for "no credentials"; treat as absence
  // in case it ever reaches the engine via stale persistence/import.
  const credentialsId =
    rawCredentialsId && rawCredentialsId !== 'default'
      ? rawCredentialsId
      : undefined
  let credentialData: RestApiCredentials['data'] | undefined
  if (credentialsId) {
    const resolved = await resolveRestApiCredentialData({
      credentialsId,
      workspaceId: state.typebotsQueue[0].typebot.workspaceId,
    })
    if (!resolved) {
      logs.push({
        status: 'error',
        description: `Referenced credential could not be resolved for this workspace.`,
      })
      return { outgoingEdgeId: block.outgoingEdgeId, logs }
    }
    credentialData = resolved
  }

  const parsedWebhook = await parseWebhookAttributes({
    webhook,
    isCustomBody: block.options?.isCustomBody,
    typebot: state.typebotsQueue[0].typebot,
    answers: state.typebotsQueue[0].answers,
    credentialData,
  })
  if (!parsedWebhook) {
    logs.push({
      status: 'error',
      description: `Couldn't parse webhook attributes`,
    })
    return { outgoingEdgeId: block.outgoingEdgeId, logs }
  }

  // Validate the resolved URL (after interpolation). Genuinely unsafe URLs
  // (bad scheme / metadata host) are blocked for every block. Parse failures
  // only abort credentialed blocks, to avoid regressing legacy flows whose
  // URLs `ky` tolerates but `new URL()` does not.
  const urlSafety = isResolvedUrlSafe(parsedWebhook.url)
  if (
    !urlSafety.safe &&
    (credentialData || urlSafety.reason !== 'Invalid URL')
  ) {
    logs.push({
      status: 'error',
      description: `Request URL rejected: ${urlSafety.reason}`,
    })
    return { outgoingEdgeId: block.outgoingEdgeId, logs }
  }

  // Credential-backed blocks must never execute on the client, otherwise the
  // resolved secret headers/params would be sent to the browser.
  if (block.options?.isExecutedOnClient && !credentialData && !state.whatsApp)
    return {
      outgoingEdgeId: block.outgoingEdgeId,
      clientSideActions: [
        {
          type: 'webhookToExecute',
          webhookToExecute: parsedWebhook,
          expectsDedicatedReply: true,
        },
      ],
    }
  const webhookTypebot = state.typebotsQueue[0].typebot
  const webhookWorkspaceName = webhookTypebot.workspaceName ?? 'unknown'
  const logContext: LogContext = {
    workspace: {
      id: webhookTypebot.workspaceId ?? 'unknown',
      name: webhookWorkspaceName,
    },
    workflow: {
      id: webhookTypebot.id,
      name: webhookTypebot.name ?? 'unknown',
      schema_version: String(webhookTypebot.version ?? 'unknown'),
      execution_id: params.sessionId ?? 'preview',
      version_id: webhookTypebot.typebotHistoryId ?? 'unknown',
    },
  }

  const {
    response: webhookResponse,
    logs: executeWebhookLogs,
    startTimeShouldBeUpdated,
  } = await executeWebhook(
    parsedWebhook,
    {
      ...params,
      timeout: block.options?.timeout,
    },
    logContext
  )

  return {
    ...resumeWebhookExecution({
      state,
      block,
      logs: executeWebhookLogs,
      response: webhookResponse,
    }),
    startTimeShouldBeUpdated,
  }
}

const checkIfBodyIsAVariable = (body: string) => /^{{.+}}$/.test(body)

export const parseWebhookAttributes = async ({
  webhook,
  isCustomBody,
  typebot,
  answers,
  credentialData,
}: {
  webhook: HttpRequest
  isCustomBody?: boolean
  typebot: TypebotInSession
  answers: AnswerInSessionState[]
  credentialData?: RestApiCredentials['data']
}): Promise<ParsedWebhook | undefined> => {
  // With a credential, the request URL is composed from the credential base
  // URL even when the block's own URL (path suffix) is empty.
  if (!webhook.url && !credentialData) return

  // Collect resolved (interpolated) secret values for log masking, and merge
  // credential-level headers/query params with the block's own.
  const secretValues = new Set<string>()
  if (credentialData) {
    // Capture the block's own (local) entries before the merge so we can decide
    // per-source what to mask.
    const localHeaders = webhook.headers ?? []
    const localQueryParams = webhook.queryParams ?? []
    webhook = {
      ...webhook,
      // Header names are case-insensitive, so a block-level `authorization` must
      // override a credential `Authorization` (and vice versa). Query param keys
      // stay case-sensitive.
      headers: mergeKeyValues(credentialData.headers, webhook.headers, {
        caseInsensitiveKeys: true,
      }),
      queryParams: mergeKeyValues(
        credentialData.queryParams,
        webhook.queryParams
      ),
    }
    const collectSecret = (value: string | undefined) => {
      if (!value) return
      addMaskableSecret(secretValues, parseVariables(typebot.variables)(value))
    }
    // Credential values are secret by definition -> always masked.
    credentialData.headers?.forEach((h) => collectSecret(h.value))
    credentialData.queryParams?.forEach((q) => collectSecret(q.value))
    // Block-level overrides only carry auth material under sensitive keys
    // (Authorization, Cookie, *token*, *api-key*, ...). Masking every block value
    // would bullet out non-secrets like `Accept: application/json` in ChatLog.
    localHeaders.forEach((h) => {
      if (isSensitiveHeaderKey(h.key)) collectSecret(h.value)
    })
    localQueryParams.forEach((q) => {
      if (isSensitiveHeaderKey(q.key)) collectSecret(q.value)
    })
  }

  const basicAuth: { username?: string; password?: string } = {}
  const basicAuthHeaderIdx = webhook.headers?.findIndex(
    (h) =>
      h.key?.toLowerCase() === 'authorization' &&
      h.value?.toLowerCase()?.includes('basic')
  )
  const isUsernamePasswordBasicAuth =
    basicAuthHeaderIdx !== -1 &&
    isDefined(basicAuthHeaderIdx) &&
    webhook.headers?.at(basicAuthHeaderIdx)?.value?.includes(':')
  if (isUsernamePasswordBasicAuth) {
    const [username, password] =
      webhook.headers?.at(basicAuthHeaderIdx)?.value?.slice(6).split(':') ?? []
    basicAuth.username = username
    basicAuth.password = password
    // The user/pass get spread into the logged `request` object as separate
    // fields, so the full "Basic user:pass" header value already collected
    // wouldn't mask them. Mask the parts too when they came from a credential.
    if (credentialData) {
      // Mask even short user/pass: they're credential-derived secrets, and the
      // API could echo a short value in an error/response body. Accepts some log
      // noise as the safer trade-off (the full Basic header is masked too).
      if (username) addMaskableSecret(secretValues, username, { allowShort: true })
      if (password) addMaskableSecret(secretValues, password, { allowShort: true })
    }
    webhook.headers?.splice(basicAuthHeaderIdx, 1)
  }
  const headers = convertKeyValueTableToObject(
    webhook.headers,
    typebot.variables
  ) as ExecutableHttpRequest['headers'] | undefined
  const queryParams = stringify(
    convertKeyValueTableToObject(webhook.queryParams, typebot.variables)
  )
  const bodyContent = await getBodyContent({
    body: webhook.body,
    answers,
    variables: typebot.variables,
    isCustomBody,
  })
  const method = webhook.method ?? defaultWebhookAttributes.method
  const { data: body, isJson } =
    bodyContent && method !== HttpMethod.GET
      ? safeJsonParse(
          parseVariables(typebot.variables, {
            isInsideJson: !checkIfBodyIsAVariable(bodyContent),
          })(bodyContent)
        )
      : { data: undefined, isJson: false }

  const urlBase = credentialData
    ? cleanUrlConcat(credentialData.baseUrl, webhook.url ?? '')
    : webhook.url ?? ''

  return {
    url: parseVariables(typebot.variables)(
      urlBase + (queryParams !== '' ? `?${queryParams}` : '')
    ),
    basicAuth,
    method,
    headers,
    body,
    isJson,
    secretValues: credentialData ? secretValues : undefined,
  }
}

export const executeWebhook = async (
  webhook: ParsedWebhook,
  params: Params = {},
  logContext?: LogContext
): Promise<{
  response: HttpResponse
  logs?: ChatLog[]
  startTimeShouldBeUpdated?: boolean
}> => {
  const logs: ChatLog[] = []

  const { headers, url, method, basicAuth, isJson } = webhook
  const secretValues = webhook.secretValues ?? new Set<string>()
  // Mask credential-derived secrets in anything that gets persisted/logged.
  const mask = <T>(value: T): T => maskSecretsDeep(value, secretValues)
  // `secretValues` is defined (even if empty) only for credential-backed
  // requests. Those must not follow redirects: the SSRF guard only validates
  // the initial URL, and `ky` would otherwise replay the secret headers to a
  // 302 Location (e.g. the cloud metadata IP). 'manual' makes `ky` throw on a
  // 3xx instead of following it, so the secret never leaves the validated host.
  const isCredentialed = webhook.secretValues !== undefined
  const contentType = headers ? headers['Content-Type'] : undefined

  const isLongRequest = params.disableRequestTimeout
    ? true
    : longReqTimeoutWhitelist.some((whiteListedUrl) =>
        url?.includes(whiteListedUrl)
      )

  const isFormData = contentType?.includes('x-www-form-urlencoded')

  let body = webhook.body

  if (isFormData && isJson) body = parseFormDataBody(body as object)

  const calculateTimeout = (): number | false => {
    // No global timeout configured
    if (isNotDefined(env.CHAT_API_TIMEOUT)) {
      return false
    }

    // Custom timeout provided in parameters
    if (params.timeout && params.timeout !== defaultTimeout) {
      return Math.min(params.timeout, maxTimeout) * 1000
    }

    // Long-running request (whitelisted URLs or explicitly disabled)
    if (isLongRequest) {
      return maxTimeout * 1000
    }

    // Default timeout
    return defaultTimeout * 1000
  }

  const request = {
    url,
    method,
    headers: headers ?? {},
    ...(basicAuth ?? {}),
    json: !isFormData && body && isJson ? body : undefined,
    body: (isFormData && body ? body : undefined) as any,
    timeout: calculateTimeout(),
    ...(isCredentialed ? { redirect: 'manual' as const } : {}),
  } satisfies Options & { url: string; body: any }

  const requestStartTime = Date.now()

  try {
    const response = await ky(request.url, omit(request, 'url'))
    const body = await parseResponseBody(response)
    logs.push({
      status: 'success',
      description: webhookSuccessDescription,
      // Mask request and response independently: maskSecretsDeep shares one scan
      // budget per call, so masking them together would let a huge response body
      // exhaust it before request.url/headers are reached.
      details: {
        statusCode: response.status,
        response: mask(body),
        request: mask(request),
      },
    })
    const httpDuration = Date.now() - requestStartTime
    logger.info(
      `${logContext?.workspace.name ?? 'unknown'} - HTTP Request Executed`,
      {
        ...logContext,
        http: {
          url: mask(request.url),
          method: request.method,
          status_code: response.status,
          duration: httpDuration,
        },
      }
    )
    return {
      response: {
        statusCode: response.status,
        data: body,
      },
      logs,
      startTimeShouldBeUpdated: true,
    }
  } catch (error) {
    if (error instanceof HTTPError) {
      const response = {
        statusCode: error.response.status,
        data: await parseResponseBody(error.response),
      }
      // With redirect:'manual' (credential-backed requests) ky throws on a 3xx
      // instead of following it; surface a clear reason rather than a bare 3xx.
      const isBlockedRedirect =
        isCredentialed &&
        error.response.status >= 300 &&
        error.response.status < 400
      logs.push({
        status: 'error',
        description: isBlockedRedirect
          ? `Request blocked: the endpoint attempted a redirect, which is not followed for credential-backed requests.`
          : webhookErrorDescription,
        details: {
          statusCode: error.response.status,
          request: mask(request),
          response: mask(response),
        },
      })
      logger.warn(
        `${logContext?.workspace.name ?? 'unknown'} - HTTP Request Error`,
        {
          ...logContext,
          http: {
            url: mask(request.url),
            method: request.method,
            status_code: error.response.status,
            duration: Date.now() - requestStartTime,
          },
        }
      )
      return { response, logs, startTimeShouldBeUpdated: true }
    }
    if (error instanceof TimeoutError) {
      const response = {
        statusCode: 408,
        data: {
          message: `Request timed out. (${
            (request.timeout ? request.timeout : 0) / 1000
          }s)`,
        },
      }
      logs.push({
        status: 'error',
        description: `Webhook request timed out. (${
          (request.timeout ? request.timeout : 0) / 1000
        }s)`,
        details: {
          response: mask(response),
          request: mask(request),
        },
      })
      logger.error(
        `${logContext?.workspace.name ?? 'unknown'} - HTTP Request Timeout`,
        {
          ...logContext,
          http: {
            url: mask(request.url),
            method: request.method,
            timeout_ms: request.timeout || 0,
            duration: Date.now() - requestStartTime,
          },
        }
      )
      return { response, logs, startTimeShouldBeUpdated: true }
    }
    const response = {
      statusCode: 500,
      data: { message: `Error from Typebot server: ${error}` },
    }
    logger.error(
      `${logContext?.workspace.name ?? 'unknown'} - HTTP Request Failed`,
      {
        ...logContext,
        http: {
          url: mask(request.url),
          method: request.method,
          duration: Date.now() - requestStartTime,
        },
        error: mask(error instanceof Error ? error.message : String(error)),
      }
    )
    logs.push({
      status: 'error',
      description: `Webhook failed to execute.`,
      details: {
        response: mask(response),
        request: mask(request),
      },
    })
    return { response, logs, startTimeShouldBeUpdated: true }
  }
}

const getBodyContent = async ({
  body,
  answers,
  variables,
  isCustomBody,
}: {
  body?: string | null
  answers: AnswerInSessionState[]
  variables: Variable[]
  isCustomBody?: boolean
}): Promise<string | undefined> => {
  return body === '{{state}}' || isEmpty(body) || isCustomBody !== true
    ? JSON.stringify(
        parseAnswers({
          answers,
          variables,
        })
      )
    : body ?? undefined
}

export const convertKeyValueTableToObject = (
  keyValues: KeyValue[] | undefined,
  variables: Variable[]
) => {
  if (!keyValues) return
  return keyValues.reduce((object, item) => {
    const key = parseVariables(variables)(item.key)
    const value = parseVariables(variables)(item.value)
    if (isEmpty(key) || isEmpty(value)) return object
    return {
      ...object,
      [key]: value,
    }
  }, {})
}

const parseFormDataBody = (body: object) => {
  const searchParams = new URLSearchParams()
  Object.entries(body as object).forEach(([key, value]) => {
    searchParams.set(key, value)
  })
  return searchParams
}
