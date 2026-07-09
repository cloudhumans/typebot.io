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
        .map((sub) => formatErrorWithCause(sub, maxDepth - 1))
        .join('; ')
      return `${String(value)} [${inner}]`
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
