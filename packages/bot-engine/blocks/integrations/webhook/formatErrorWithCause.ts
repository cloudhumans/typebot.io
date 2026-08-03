/**
 * Under Node/undici a fetch network failure surfaces as `TypeError: fetch failed`
 * with the actionable reason (ECONNREFUSED, ENOTFOUND, cert errors) hidden in
 * `error.cause`, or in `AggregateError.errors` (happy-eyeballs IPv4/IPv6). This
 * walks the cause chain so the reason survives instead of the opaque top-level.
 */
export const formatErrorWithCause = (error: unknown, maxDepth = 5): string => {
  const stringifyOne = (value: unknown): string => {
    if (
      value instanceof AggregateError &&
      Array.isArray(value.errors) &&
      value.errors.length > 0
    ) {
      const inner = value.errors
        .map((sub) => formatErrorWithCause(sub, Math.max(0, maxDepth - 1)))
        .join('; ')
      return `${String(value)} [${inner}]`
    }
    // undici network errors can carry no message at all (makeNetworkError()
    // called with no reason yields `new Error(undefined)`), so String() gives
    // just "Error". The code and top stack frames are then the only thing
    // identifying which failure occurred — surface them.
    if (value instanceof Error && value.message === '') {
      const code = (value as { code?: unknown }).code
      const frames = value.stack
        ?.split('\n')
        .slice(1, 4)
        .map((line) => line.trim().replace(/^at /, ''))
        .filter(Boolean)
      return [
        String(value),
        code == null ? undefined : `[code=${String(code)}]`,
        frames && frames.length > 0 ? `[at ${frames.join(' <- ')}]` : undefined,
      ]
        .filter(Boolean)
        .join(' ')
    }
    return String(value)
  }

  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  let depth = 0
  while (current != null && depth <= maxDepth) {
    if (typeof current === 'object') {
      if (seen.has(current)) break
      seen.add(current)
    }
    parts.push(stringifyOne(current))
    current =
      current instanceof Error
        ? (current as { cause?: unknown }).cause
        : undefined
    depth++
  }

  return parts.join(' (cause: ') + ')'.repeat(parts.length - 1)
}
