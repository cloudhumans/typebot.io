import { createId } from '@paralleldrive/cuid2'

export const resolveCorrelationId = (
  headers: Record<string, unknown>
): { id: string; generated: boolean } => {
  const raw = (headers['x-correlation-id'] || headers['X-Correlation-Id']) as
    | string
    | string[]
    | undefined
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !isValidCorrelationId(value))
    return { id: createId(), generated: true }
  return { id: value, generated: false }
}

const isValidCorrelationId = (v: string) =>
  v.length <= 128 && /^[A-Za-z0-9_\-:.]+$/.test(v)

export const setCorrelationHeader = (
  res: { setHeader?: (k: string, v: string) => void } | undefined,
  id: string
) => {
  if (res?.setHeader) res.setHeader('X-Correlation-Id', id)
}

export const applyCorrelationToSpan = (
  span: any,
  info: { id: string; generated: boolean }
) => {
  if (!span || typeof span.setTag !== 'function') return
  span.setTag('correlation.id', info.id)
  if (info.generated) span.setTag('correlation.generated', true)
}
