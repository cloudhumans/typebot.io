import { JSONParse } from '@typebot.io/lib/JSONParse'

/**
 * Parses a JSON string, falling back to the raw input when parsing fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const safeJsonParse = (
  json: unknown
): { data: any; isJson: boolean } => {
  try {
    return { data: JSONParse(json as string), isJson: true }
  } catch (err) {
    return { data: json, isJson: false }
  }
}

/**
 * Reads an HTTP response body without trusting the Content-Type header.
 *
 * Some upstreams lie about their content type — e.g. AWS Lambda Function URLs
 * respond to 502s with `Content-Type: application/json` and the plain-text
 * body "Internal Server Error". Calling `response.json()` based on the header
 * throws a SyntaxError that escapes the webhook error handling entirely.
 *
 * Instead we always read the body as text and attempt a safe JSON parse:
 * valid JSON yields the parsed value, anything else yields the raw string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseResponseBody = async (response: {
  text: () => Promise<string>
}): Promise<any> => {
  const text = await response.text()
  return safeJsonParse(text).data
}
