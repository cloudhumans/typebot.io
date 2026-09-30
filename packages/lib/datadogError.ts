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

export const splitErrorArgument = (args: unknown[]) => {
  const error = args.find(isError)
  return {
    error,
    rest: error ? args.filter((arg) => arg !== error) : args,
  }
}
