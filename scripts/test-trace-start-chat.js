#!/usr/bin/env node
// Simple load/trace test script for startChat endpoint (JS version).
// Now optionally emits its own Datadog spans and injects trace headers.
// Usage:
//   node scripts/test-trace-start-chat.js <TYPEBOT_ID>
//   ITERATIONS=20 CONCURRENCY=5 DEBUG=true node scripts/test-trace-start-chat.js <TYPEBOT_ID>
//   ENABLE_TRACING=true node scripts/test-trace-start-chat.js <TYPEBOT_ID>
//   ENABLE_TRACING=true TRACE_SERVICE=trace-test ITERATIONS=10 CONCURRENCY=3 DEBUG=true node scripts/test-trace-start-chat.js <TYPEBOT_ID>

const crypto = require('crypto')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003'
const TYPEBOT_ID = process.argv[2] || process.env.TYPEBOT_ID
if (!TYPEBOT_ID) {
  console.error('Missing TYPEBOT_ID (arg or env).')
  process.exit(1)
}
const ITERATIONS = Number(process.env.ITERATIONS || 5)
const CONCURRENCY = Number(process.env.CONCURRENCY || 1)
const DELAY_MS = Number(process.env.DELAY_MS || 0)
const DEBUG = process.env.DEBUG === 'true'
const ENABLE_TRACING =
  process.env.ENABLE_TRACING === 'true' || process.env.TRACE === '1'
const TRACE_SERVICE = process.env.TRACE_SERVICE || 'trace-test-script'
let tracer = null
if (ENABLE_TRACING) {
  // Attempt to locate dd-trace even if script is executed from repo root (which has no direct dep).
  const candidatePaths = [
    process.cwd(),
    process.cwd() + '/apps/viewer',
    process.cwd() + '/apps/builder',
    process.cwd() + '/packages/lib',
  ]
  for (const p of candidatePaths) {
    try {
      const dd = require(require.resolve('dd-trace', { paths: [p] }))
      tracer = dd.init({ service: TRACE_SERVICE })
      if (DEBUG)
        console.log('[trace-script] dd-trace initialized from path base', p)
      break
    } catch (e) {
      // continue
    }
  }
  if (!tracer) {
    console.warn(
      '[trace-script] ENABLE_TRACING requested but dd-trace not found in candidate workspaces; continuing without custom spans.'
    )
  }
}
const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.BEARER || null

const endpoint = `${BASE_URL}/api/v1/typebots/${TYPEBOT_ID}/preview/startChat`

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function injectDatadogHeaders(span, headers) {
  if (!span || !span.context) return
  try {
    const ctx = span.context()
    if (
      typeof ctx.toTraceId === 'function' &&
      typeof ctx.toSpanId === 'function'
    ) {
      headers['x-datadog-trace-id'] = ctx.toTraceId()
      headers['x-datadog-parent-id'] = ctx.toSpanId()
      headers['x-datadog-sampling-priority'] = '1'
      // headers['x-datadog-origin'] = 'ciapp-test' // optional
    }
  } catch (e) {
    if (DEBUG) console.log('[trace-script] inject headers failed', e.message)
  }
}

async function sendOnce(i) {
  const visitorId = crypto.randomUUID()
  const body = { visitorId }
  const start = Date.now()
  const headers = {
    'content-type': 'application/json',
    'x-trace-test': `run-${start}-${i}`,
  }
  if (AUTH_TOKEN) headers['authorization'] = `Bearer ${AUTH_TOKEN}`
  const execRequest = async (span) => {
    if (span) injectDatadogHeaders(span, headers)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const ms = Date.now() - start
    let json = null
    try {
      json = await res.json()
    } catch {}
    if (DEBUG) {
      const respTraceHeaders = Object.fromEntries(
        Object.entries(Object.fromEntries(res.headers.entries())).filter(
          ([k]) => k.startsWith('x-datadog')
        )
      )
      console.log('Resp', i, res.status, ms, json, {
        injected: span
          ? {
              trace: span.context().toTraceId(),
              span: span.context().toSpanId(),
            }
          : null,
        respTraceHeaders,
      })
    }
    return { status: res.status, ms }
  }

  if (tracer) {
    return await tracer.trace(
      'test.startChat.request',
      { resource: 'startChat', tags: { 'bot.id': TYPEBOT_ID } },
      async (span) => execRequest(span)
    )
  }
  return await execRequest(null)
}

async function run() {
  console.log('Trace test start', {
    endpoint,
    ITERATIONS,
    CONCURRENCY,
    ENABLE_TRACING,
    TRACE_SERVICE,
  })
  const results = []
  for (let batchStart = 0; batchStart < ITERATIONS; batchStart += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, ITERATIONS - batchStart) },
      (_, k) => sendOnce(batchStart + k)
    )
    const settled = await Promise.allSettled(batch)
    for (const s of settled) if (s.status === 'fulfilled') results.push(s.value)
    if (DELAY_MS) await delay(DELAY_MS)
  }
  const avg = results.reduce((a, r) => a + r.ms, 0) / (results.length || 1)
  const statuses = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})
  console.log('Summary', {
    count: results.length,
    avgMs: Math.round(avg),
    statuses,
  })
  console.log(
    'Done. Check Datadog for trpc.request spans and x-trace-test header correlation.'
  )
}

run().catch((e) => {
  console.error('Failed', e)
  process.exit(1)
})
