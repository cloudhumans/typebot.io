import { HttpRequestBlockV6 } from './schema'

export enum HttpMethod {
  POST = 'POST',
  GET = 'GET',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  CONNECT = 'CONNECT',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
}

export const defaultWebhookAttributes = {
  method: HttpMethod.POST,
} as const

export const defaultWebhookBlockOptions = {
  isAdvancedConfig: false,
  isCustomBody: false,
  isExecutedOnClient: false,
} as const satisfies HttpRequestBlockV6['options']

export const defaultTimeout = 10
export const maxTimeout = 120

// Single source of truth for the credential-secret mask string, shared by the
// runtime (bot-engine log masking) and the builder (masked credential read), so
// the UI never shows a different representation than the one used in logs.
export const maskedValue = '••••••••'
