import { isDefined, isNotDefined } from '@typebot.io/lib/utils'
import { computeCurrentProgress } from '../computeCurrentProgress'
import { filterPotentiallySensitiveLogs } from '../logs/filterPotentiallySensitiveLogs'
import { restartSession } from '../queries/restartSession'
import { saveStateToDatabase } from '../saveStateToDatabase'
import { startSession } from '../startSession'
import logger from '@typebot.io/lib/logger'

type Props = {
  origin: string | undefined
  message?: string
  isOnlyRegistering: boolean
  publicId: string
  isStreamEnabled: boolean
  prefilledVariables?: Record<string, unknown>
  resultId?: string
  textBubbleContentFormat: 'richText' | 'markdown'
  /**
   * When true, the returned `logs` are NOT run through
   * `filterPotentiallySensitiveLogs`. This is opt-in for trusted, server-to-server
   * callers (the bearer-authed MCP route) that need to observe error-status logs
   * which the public filter strips by description (e.g. `webhookErrorDescription`
   * on HTTP 4xx/5xx).
   *
   * WARNING: these raw logs may contain sensitive details — not every log is
   * secret-masked at push time (e.g. the sendEmail `!emailBody` branch logs
   * `transportConfig.auth.pass` unmasked). Callers must not forward these logs to
   * untrusted clients; re-filter them (see `executeWorkflow`) before returning.
   * The default (false) keeps the public chat API response byte-identical.
   */
  skipSensitiveLogFiltering?: boolean
}

export const startChat = async ({
  origin,
  message,
  isOnlyRegistering,
  publicId,
  isStreamEnabled,
  prefilledVariables,
  resultId: startResultId,
  textBubbleContentFormat,
  skipSensitiveLogFiltering = false,
}: Props) => {
  logger.info('startChat called', {
    publicId,
    hasMessage: !!message,
    isOnlyRegistering,
    isStreamEnabled,
    hasPrefilledVariables: !!prefilledVariables,
    hasResultId: !!startResultId,
    textBubbleContentFormat,
    origin,
  })

  try {
    const {
      typebot,
      messages,
      input,
      resultId,
      dynamicTheme,
      logs,
      clientSideActions,
      newSessionState,
      visitedEdges,
      setVariableHistory,
    } = await startSession({
      version: 2,
      startParams: {
        type: 'live',
        isOnlyRegistering,
        isStreamEnabled,
        publicId,
        prefilledVariables,
        resultId: startResultId,
        textBubbleContentFormat,
      },
      message,
  })

  logger.info('startSession completed', {
    publicId,
    typebotId: typebot.id,
    hasMessages: !!messages && messages.length > 0,
    hasInput: !!input,
    hasResultId: !!resultId,
    hasNewSessionState: !!newSessionState,
    allowedOrigins: newSessionState.allowedOrigins,
  })

  let corsOrigin

  if (
    newSessionState.allowedOrigins &&
    newSessionState.allowedOrigins.length > 0
  ) {
    if (origin && newSessionState.allowedOrigins.includes(origin))
      corsOrigin = origin
    else corsOrigin = newSessionState.allowedOrigins[0]
  }

  logger.info('startChat session save mode', {
    publicId,
    isOnlyRegistering,
    typebotId: typebot.id,
    resultId,
    corsOrigin,
  })

  const session = isOnlyRegistering
    ? await restartSession({
        state: newSessionState,
      })
    : await saveStateToDatabase({
        session: {
          state: newSessionState,
        },
        input,
        logs,
        clientSideActions,
        visitedEdges,
        setVariableHistory,
        hasCustomEmbedBubble: messages.some(
          (message) => message.type === 'custom-embed'
        ),
      })

  logger.info('Session saved successfully', {
    publicId,
    sessionId: session.id,
    typebotId: typebot.id,
    resultId,
    isOnlyRegistering,
  })

  logger.info('startChat session details for continueChat troubleshooting', {
    publicId,
    sessionId: session.id,
    typebotId: typebot.id,
    resultId,
    sessionCreatedAt: new Date().toISOString(),
    sessionStateKeys: newSessionState ? Object.keys(newSessionState).length : 0,
    hasInput: !!input,
    inputId: input?.id,
    inputType: input?.type,
  })

  const isEnded =
    newSessionState.progressMetadata &&
    !input?.id &&
    (clientSideActions?.filter((c) => c.expectsDedicatedReply).length ?? 0) ===
      0

  const isPreview = isNotDefined(newSessionState.typebotsQueue[0]?.resultId)

  return {
    sessionId: session.id,
    typebot: {
      id: typebot.id,
      theme: typebot.theme,
      settings: typebot.settings,
    },
    messages,
    input,
    resultId,
    variables: isPreview
      ? newSessionState.typebotsQueue[0]?.typebot.variables
          .filter((variable) => isDefined(variable.value))
          .map((variable) => ({
            id: variable.id,
            name: variable.name,
            value: variable.value,
          }))
      : undefined,
    dynamicTheme,
    logs: skipSensitiveLogFiltering
      ? logs
      : logs?.filter(filterPotentiallySensitiveLogs),
    clientSideActions,
    corsOrigin,
    progress: newSessionState.progressMetadata
      ? isEnded
        ? 100
        : computeCurrentProgress({
            typebotsQueue: newSessionState.typebotsQueue,
            progressMetadata: newSessionState.progressMetadata,
            currentInputBlockId: input?.id,
          })
      : undefined,
  }
  } catch (error) {
    logger.error('Error in startChat', {
      publicId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      origin,
      isOnlyRegistering,
    })
    throw error
  }
}
