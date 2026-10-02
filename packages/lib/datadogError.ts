const MAX_CAUSE_DEPTH = 5

const isError = (value: unknown): value is Error => value instanceof Error

const headline = (error: Error) =>
  error.stack ?? `${error.name}: ${error.message}`

const stackWithCauses = (error: Error) => {
  let stack = headline(error)
  let cause = (error as { cause?: unknown }).cause
  for (let depth = 0; isError(cause) && depth < MAX_CAUSE_DEPTH; depth++) {
    stack += `\nCaused by: ${headline(cause)}`
    cause = (cause as { cause?: unknown }).cause
  }
  return stack
}

export const toDatadogError = (error: Error) => ({
  kind: error.name,
  message: error.message,
  stack: stackWithCauses(error),
})

export const applyDatadogError = <T extends object>(info: T): T => {
  const record = info as Record<string, unknown>
  const candidate = isError(record.error)
    ? record.error
    : isError(record.err)
    ? record.err
    : undefined
  if (!candidate) return info
  if (candidate === record.err) delete record.err
  record.error = toDatadogError(candidate)
  return info
}

export const findError = (args: unknown[]) => args.find(isError)

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

const isTrpcClientError = (error: unknown) =>
  error instanceof Error &&
  error.name === 'TRPCError' &&
  (error as { code?: unknown }).code !== 'INTERNAL_SERVER_ERROR'

export const isCallerError = (error: unknown) =>
  error instanceof ToolInputError || isTrpcClientError(error)

const loggedErrors = new WeakSet<object>()

export const markErrorLogged = (error: unknown) => {
  if (typeof error === 'object' && error !== null) loggedErrors.add(error)
}

export const wasErrorLogged = (error: unknown) =>
  typeof error === 'object' && error !== null && loggedErrors.has(error)

type FailureLogger = {
  debug: (message: string, meta: Record<string, unknown>) => void
  warn: (message: string, meta: Record<string, unknown>) => void
  error: (message: string, meta: Record<string, unknown>) => void
}

export const logFailureOnce = (
  log: FailureLogger,
  message: string,
  fields: Record<string, unknown>,
  error: unknown
) => {
  if (wasErrorLogged(error)) {
    log.debug(message, {
      ...fields,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    return
  }
  const level = isCallerError(error) ? 'warn' : 'error'
  log[level](message, {
    ...fields,
    error: error instanceof Error ? error : String(error),
  })
  markErrorLogged(error)
}

export const jsonRpcCodeFor = (error: unknown) =>
  error instanceof ToolInputError ? -32602 : -32603
