import axios from 'axios'
import { promises as fs } from 'fs'
import path from 'path'

type Options = {
  url: string
  token: string | null
  concurrency: number
  total: number
  timeoutMs: number
  message: string
  out: string | null
}

function parseArgs(): Options {
  const argv = process.argv.slice(2)
  const map: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val =
        argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      map[key] = val
    }
  }

  const url =
    map.url ||
    'http://localhost:3003/api/v1/typebots/cmgqokotu00151eo3igddmqdg/preview/startChat'
  const token = map.token || map.auth || 'X1rUXTci8DbArxMTtMtOi1Py'
  const concurrency = parseInt(map.concurrency || map.c || '10', 10)
  const total = parseInt(map.total || map.t || '50', 10)
  const timeoutMs = parseInt(map.timeout || '60000', 10)
  const message =
    map.message || map.msg || 'olá. você conhece boas receitas de bolo?'
  const out = map.out || map.o || null

  return { url, token, concurrency, total, timeoutMs, message, out }
}

async function sendOne(
  url: string,
  token: string | null,
  timeoutMs: number,
  message: string
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const start = Date.now()
  try {
    // 1) startChat -> creates a sessionId
    const startResp = await axios.post(url, {}, { headers, timeout: timeoutMs })
    const sessionId: string | undefined = startResp?.data?.sessionId

    if (!sessionId) {
      const time = Date.now() - start
      return {
        ok: false,
        phase: 'startChat',
        status: startResp?.status || 0,
        time,
        message: 'no sessionId in startChat response',
      }
    }

    // build continue URL using origin
    let continueUrl: string
    try {
      const u = new URL(url)
      continueUrl = `${u.origin}/api/v1/sessions/${sessionId}/continueChat`
    } catch (e) {
      // fallback: replace known path
      continueUrl = `/api/v1/sessions/${sessionId}/continueChat`
    }

    // 2) continueChat with a message
    const contResp = await axios.post(
      continueUrl,
      { message },
      { headers, timeout: timeoutMs }
    )

    const time = Date.now() - start
    return {
      ok: true,
      sessionId,
      statusStart: startResp.status,
      statusContinue: contResp.status,
      time,
    }
  } catch (err: any) {
    const time = Date.now() - start
    const status = err?.response?.status || 0
    const messageErr = err?.message || String(err)
    return { ok: false, status, time, message: messageErr }
  }
}

async function run() {
  const opts = parseArgs()
  console.log('Load test options:', opts)

  let inFlight = 0
  let sent = 0
  let completed = 0
  let success = 0
  let failure = 0
  const latencies: number[] = []

  return new Promise<void>((resolve) => {
    const results: Array<Record<string, any>> = []
    const tryStart = async () => {
      while (inFlight < opts.concurrency && sent < opts.total) {
        sent++
        inFlight++
        ;(async () => {
          const r = await sendOne(
            opts.url,
            opts.token,
            opts.timeoutMs,
            opts.message
          )
          // collect per-request result
          results.push({
            id: sent,
            timestamp: new Date().toISOString(),
            ok: !!r.ok,
            sessionId: r.sessionId || '',
            statusStart: r.statusStart || null,
            statusContinue: r.statusContinue || null,
            phase: r.phase || null,
            status: r.status || null,
            time: r.time,
            message: r.message || '',
          })
          completed++
          inFlight--
          if (r.ok) success++
          else failure++
          latencies.push(r.time)
          // periodic log
          if (
            completed % Math.max(1, Math.floor(opts.total / 10)) === 0 ||
            completed === opts.total
          ) {
            const avg =
              latencies.reduce((a, b) => a + b, 0) / latencies.length || 0
            console.log(
              `completed ${completed}/${
                opts.total
              } — success=${success} failure=${failure} avgLatency=${avg.toFixed(
                1
              )}ms`
            )
          }

          if (completed >= opts.total) {
            // final report
            const sum = latencies.reduce((a, b) => a + b, 0)
            const avg = latencies.length ? sum / latencies.length : 0
            latencies.sort((a, b) => a - b)
            const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0
            const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0
            const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0
            console.log('\n=== Final report ===')
            console.log(`requests: ${opts.total}`)
            console.log(`success: ${success}`)
            console.log(`failure: ${failure}`)
            console.log(`avg latency: ${avg.toFixed(1)} ms`)
            console.log(`p50: ${p50} ms p90: ${p90} ms p99: ${p99} ms`)
            // write CSV/JSON output if requested
            ;(async () => {
              try {
                const outPath = opts.out
                  ? path.resolve(__dirname, opts.out)
                  : path.resolve(__dirname, `results-${Date.now()}.csv`)

                const header = [
                  'id',
                  'timestamp',
                  'ok',
                  'sessionId',
                  'statusStart',
                  'statusContinue',
                  'phase',
                  'status',
                  'time',
                  'message',
                ]

                const escape = (s: any) => {
                  if (s === null || s === undefined) return ''
                  const str = String(s)
                  if (
                    str.includes(',') ||
                    str.includes('"') ||
                    str.includes('\n')
                  ) {
                    return `"${str.replace(/"/g, '""')}"`
                  }
                  return str
                }

                const lines = [header.join(',')]
                for (const row of results) {
                  const line = header.map((h) => escape(row[h])).join(',')
                  lines.push(line)
                }

                await fs.writeFile(outPath, lines.join('\n'), 'utf8')
                console.log(`saved results to ${outPath}`)
              } catch (e) {
                console.error('failed to write results', e)
              } finally {
                resolve()
              }
            })()
          } else {
            // try to start more
            setImmediate(tryStart)
          }
        })()
      }
    }

    // kick off initial workers
    for (let i = 0; i < opts.concurrency; i++) setImmediate(tryStart)
  })
}

if (require.main === module) {
  run().catch((e) => {
    console.error('Error running load test', e)
    process.exit(1)
  })
}
