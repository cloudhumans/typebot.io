import { getMessageStream } from '@typebot.io/bot-engine/apiHandlers/getMessageStream'
import { StreamingTextResponse } from 'ai'
import { NextResponse } from 'next/server'
import { resolveCorrelationId } from '@typebot.io/lib/correlation'

export const dynamic = 'force-dynamic'

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Access-Control-Allow-Headers': '*',
}

export async function OPTIONS() {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
      'Access-Control-Allow-Headers': '*',
    },
  })
}

export async function POST(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  const body = await req.text()
  const correlation = resolveCorrelationId(Object.fromEntries(req.headers))
  const messages = body ? JSON.parse(body).messages : undefined
  const { stream, status, message } = await getMessageStream({
    sessionId: params.sessionId,
    messages,
  })
  const headers = { ...responseHeaders, 'X-Correlation-Id': correlation.id }
  if (!stream) return NextResponse.json({ message }, { status, headers })
  return new StreamingTextResponse(stream, {
    headers,
  })
}
