/*
  Shared graceful lifecycle module.
  Provides a singleton state inside a Node.js process for drain coordination.

  API:
    initGraceful(options?): Initialize timers & capture config.
    triggerDrain(): Begin draining (sets isDraining, schedules forced exit) idempotent.
    isDraining(): boolean
    healthSnapshot(): { status: 'ready' | 'draining', mem: { rss: number, heapUsed: number }, sinceMs?: number }
*/

interface GracefulOptions {
  totalMs?: number // Total grace window in ms
  forcedExitBufferMs?: number // Time before end to force exit
  component?: string // Optional identifier for logging
}

interface GracefulState {
  draining: boolean
  drainStartedAt: number | null
  forcedExitTimer: NodeJS.Timeout | null
  totalMs: number
  forcedExitMs: number
  component?: string
}

const defaultTotal = parseInt(process.env.GRACEFUL_TIMEOUT_MS || '180000', 10)
const defaultBuffer = parseInt(
  process.env.GRACEFUL_FORCED_EXIT_BUFFER_MS || '5000',
  10
)

const state: GracefulState = {
  draining: false,
  drainStartedAt: null,
  forcedExitTimer: null,
  totalMs: defaultTotal,
  forcedExitMs: Math.max(1000, defaultTotal - defaultBuffer),
  component: undefined,
}

export function initGraceful(opts?: GracefulOptions) {
  if (opts?.totalMs && opts.totalMs > 0) {
    state.totalMs = opts.totalMs
  }
  if (opts?.forcedExitBufferMs && opts.forcedExitBufferMs > 0) {
    state.forcedExitMs = Math.max(
      1000,
      (opts.totalMs || state.totalMs) - opts.forcedExitBufferMs
    )
  }
  if (opts?.component) state.component = opts.component
}

export function triggerDrain(): void {
  if (state.draining) return
  state.draining = true
  ;(
    global as unknown as { __TYPEBOT_DRAINING__?: boolean }
  ).__TYPEBOT_DRAINING__ = true
  state.drainStartedAt = Date.now()
  if (!state.forcedExitTimer) {
    state.forcedExitTimer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log({
        event: 'forced_exit',
        ts: new Date().toISOString(),
        component: state.component,
      })
      process.exit(0)
    }, state.forcedExitMs)
  }
  // eslint-disable-next-line no-console
  console.log({
    event: 'drain_start',
    ts: new Date().toISOString(),
    forcedExitInMs: state.forcedExitMs,
    component: state.component,
  })
}

export function isDraining(): boolean {
  return state.draining
}

export function healthSnapshot() {
  const mem = process.memoryUsage()
  if (state.draining) {
    return {
      status: 'draining' as const,
      sinceMs: state.drainStartedAt ? Date.now() - state.drainStartedAt : 0,
      mem: { rss: mem.rss, heapUsed: mem.heapUsed },
    }
  }
  return {
    status: 'ready' as const,
    mem: { rss: mem.rss, heapUsed: mem.heapUsed },
  }
}
