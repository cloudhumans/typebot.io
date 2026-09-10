import { LogsStore } from '@typebot.io/forge'

type ClaudiaAction =
  | 'END_FLOW'
  | 'FORWARD_TO_HUMAN'
  | 'FORWARD_TO_HUMAN_IGNORE_HOURS'
  | 'CLOSE_TICKET'
  | 'ANSWER_TICKET'

type ClaudiaResponse = {
  action: ClaudiaAction
  topic?: string
  searchTerm?: string
  tag?: string
  silent?: boolean
}

type TypebotLog = Extract<
  Parameters<LogsStore['add']>[0],
  { description: string }
>

export const createClaudiaResponseLog = (
  response: ClaudiaResponse
): TypebotLog => ({
  status: 'success',
  description: 'Claudia Response',
  // The tag is matched downstream by exact string, so authoring whitespace
  // would silently mistag the conversation. A blank tag is dropped rather than
  // sent as an empty string.
  details: { ...response, tag: response.tag?.trim() || undefined },
})
