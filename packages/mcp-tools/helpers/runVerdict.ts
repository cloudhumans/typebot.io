import { hasErrorLog } from './hasErrorLog'

export const TYPEBOT_ERROR_MARKER = 'Error from Typebot server:'

type LogLike = {
  status?: string
  description?: string
  details?: unknown
  blockId?: string
}

export function isFailedRun({
  result,
  output,
  hadToolOutput,
}: {
  result: { logs?: LogLike[] }
  output: string
  hadToolOutput: boolean
}): boolean {
  return (
    hasErrorLog(result) &&
    (!hadToolOutput || output.includes(TYPEBOT_ERROR_MARKER))
  )
}

export function firstErrorLog<T extends LogLike>(result: {
  logs?: T[]
}): T | undefined {
  return result.logs?.find((log) => log?.status === 'error')
}
