const NULL_BYTE = /\u0000/g

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Removes U+0000 from every string in a value tree, including object keys
 * (jsonb rejects the null byte in keys too — external webhook responses are
 * merged raw into session state). PostgreSQL text/jsonb cannot store the null
 * byte (error 22P05); AI agents occasionally send one in tool-call args.
 * Returns the same reference when nothing changed. Non-plain objects (Date,
 * Buffer, Prisma JsonNull/DbNull sentinels, Decimal) pass through untouched
 * by identity.
 */
export const sanitizeNullBytes = <T>(value: T): T => {
  if (typeof value === 'string')
    return (
      value.includes('\u0000') ? value.replace(NULL_BYTE, '') : value
    ) as T
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const cleaned = sanitizeNullBytes(item)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return (changed ? next : value) as T
  }
  if (isPlainObject(value)) {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const cleanedKey = sanitizeNullBytes(key)
      const cleaned = sanitizeNullBytes(value[key])
      if (cleanedKey !== key || cleaned !== value[key]) changed = true
      // defineProperty, not bracket assignment: a sanitized key equal to
      // "__proto__" would otherwise hit the inherited Annex B setter and
      // swap the copy's prototype instead of storing an own property.
      Object.defineProperty(next, cleanedKey, {
        value: cleaned,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
    return (changed ? next : value) as T
  }
  return value
}
