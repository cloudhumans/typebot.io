const NULL_BYTE = /\u0000/g

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// defineProperty, not bracket assignment: a key equal to "__proto__" (whether
// sanitized into it or already present as an own key, as JSON.parse can
// produce) would otherwise hit the inherited Annex B setter and swap the
// copy's prototype instead of storing an own property.
const defineOwn = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) =>
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })

// String.prototype.{isWellFormed,toWellFormed} are ES2024 (present in Node 20+,
// the runtime target) but the repo's TypeScript lib predates them, so the two
// methods are typed locally.
type WellFormedString = {
  isWellFormed(): boolean
  toWellFormed(): string
}

const sanitizeString = (value: string): string => {
  const out = (
    value.includes('\u0000') ? value.replace(NULL_BYTE, '') : value
  ) as string & WellFormedString
  // toWellFormed replaces lone/unpaired surrogates with U+FFFD but leaves the
  // null byte alone (U+0000 is valid UTF-8), so the two passes are complementary.
  return out.isWellFormed() ? out : out.toWellFormed()
}

/**
 * Makes every string in a value tree safe to persist to jsonb/text, including
 * object keys (external webhook responses are merged raw into session state).
 * Two problems, same root cause — external unicode written verbatim into jsonb:
 *   - U+0000 (null byte): PostgreSQL text/jsonb rejects it (error 22P05); AI
 *     agents occasionally send one in tool-call args.
 *   - Lone/unpaired UTF-16 surrogates (truncated emoji, multibyte text cut mid
 *     codepoint): the Prisma query engine's serde_json rejects them ("unexpected
 *     end of hex escape") when serializing the jsonb value.
 * Returns the same reference when nothing changed. Non-plain objects (Date,
 * Buffer, Prisma JsonNull/DbNull sentinels, Decimal) pass through untouched
 * by identity.
 *
 * Runs on every Prisma write (middleware hot path), so copies are allocated
 * lazily: a clean tree allocates nothing.
 */
export const sanitizeForJsonb = <T>(value: T): T => {
  if (typeof value === 'string') return sanitizeString(value) as T
  if (Array.isArray(value)) {
    let next: unknown[] | undefined
    for (let i = 0; i < value.length; i++) {
      const cleaned = sanitizeForJsonb(value[i])
      if (next === undefined && cleaned !== value[i]) next = value.slice(0, i)
      if (next !== undefined) next.push(cleaned)
    }
    return (next ?? value) as T
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    let next: Record<string, unknown> | undefined
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const cleaned = sanitizeForJsonb(value[key])
      const cleanedKey = sanitizeForJsonb(key)
      if (
        next === undefined &&
        (cleanedKey !== key || cleaned !== value[key])
      ) {
        next = Object.create(Object.getPrototypeOf(value)) as Record<
          string,
          unknown
        >
        for (let j = 0; j < i; j++) defineOwn(next, keys[j], value[keys[j]])
      }
      if (next !== undefined) defineOwn(next, cleanedKey, cleaned)
    }
    return (next ?? value) as T
  }
  return value
}
