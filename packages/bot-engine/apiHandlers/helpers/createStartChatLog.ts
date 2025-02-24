import { LogsStore } from '@typebot.io/forge'

export type StartChatLog = {
  status: 'info' | 'success' | 'error'
  description: string
  details: {
    passed: boolean
    message?: string
  }
}

export const createStartChatLog = (
  passed: boolean,
  message?: string
): StartChatLog => ({
  status: 'info',
  description: 'StartChat Log',
  details: { passed, message },
})
