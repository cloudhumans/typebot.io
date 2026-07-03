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

/**
 * Removes U+0000 from every string in a value tree, including object keys
 * (jsonb rejects the null byte in keys too — external webhook responses are
 * merged raw into session state). PostgreSQL text/jsonb cannot store the null
 * byte (error 22P05); AI agents occasionally send one in tool-call args.
 * Returns the same reference when nothing changed. Non-plain objects (Date,
 * Buffer, Prisma JsonNull/DbNull sentinels, Decimal) pass through untouched
 * by identity.
 *
 * Runs on every Prisma write (middleware hot path), so copies are allocated
 * lazily: a clean tree allocates nothing.
 */
export const sanitizeNullBytes = <T>(value: T): T => {
  if (typeof value === 'string')
    return (
      value.includes('\u0000') ? value.replace(NULL_BYTE, '') : value
    ) as T
  if (Array.isArray(value)) {
    let next: unknown[] | undefined
    for (let i = 0; i < value.length; i++) {
      const cleaned = sanitizeNullBytes(value[i])
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
      const cleaned = sanitizeNullBytes(value[key])
      const cleanedKey = sanitizeNullBytes(key)
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
