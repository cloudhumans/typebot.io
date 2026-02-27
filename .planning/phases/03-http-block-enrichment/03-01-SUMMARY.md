---
phase: 03-http-block-enrichment
plan: 01
subsystem: infra
tags: [winston, datadog, logging, http-instrumentation, webhook, vitest, tsx]

# Dependency graph
requires:
  - phase: 01-logger-foundation/01-01
    provides: Winston logger with defaultMeta ddsource/service, Zod env schema for DD vars
  - phase: 01-logger-foundation/01-02
    provides: tsx child-process test pattern, Vitest test infrastructure
  - phase: 02-block-instrumentation/02-01
    provides: Established http.* nested schema pattern and instrumentation test conventions
provides:
  - logger.info('HTTP Request Executed') on success path with http.url, method, status_code, duration
  - logger.warn('HTTP Request Error') on non-2xx HTTPError path with nested http.* schema
  - logger.error('HTTP Request Timeout') on TimeoutError path with http.timeout_ms
  - logger.error('HTTP Request Failed') on generic error path with structured http.* and safe error.message
  - Vitest tests asserting HTTP-01 through HTTP-05 schema compliance
affects: [04-trace-injection, 05-datadog-monitor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Success-path logger.info placed after logs.push({ status: 'success' }) and before return -- logs.push() is untouched (ChatLog UI)"
    - "Use request.timeout || 0 for timeout_ms -- avoids false when request.timeout is number|false"
    - "Generic error uses error instanceof Error ? error.message : String(error) for PII-safe extraction"
    - "HTTPError logger.warn uses error.response.status (real server status), not synthetic 408"
    - "TimeoutError logger.error omits http.status_code -- 408 is synthetic ChatLog value, not real server response"

key-files:
  created:
    - packages/lib/http.instrumentation.test.ts
  modified:
    - packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts

key-decisions:
  - "Success logger.info placed after logs.push({ status: 'success' }) -- preserves ChatLog UI behavior, adds structured log after"
  - "TimeoutError does NOT log http.status_code: 408 -- 408 is a synthetic value emitted by ChatLog for UX, not a real server response; omitting prevents misleading Datadog facet data"
  - "Generic error uses error instanceof Error ? error.message : String(error) -- safe serialization prevents raw Error object (Winston serializes poorly) and avoids PII exposure from stack traces"
  - "request.timeout || 0 coercion -- request.timeout type is number|false; direct use causes TypeScript error; || 0 converts false->0 safely"

patterns-established:
  - "Pattern: HTTP log placement -- success log after logs.push (ChatLog), before return; error/timeout logs before return in respective catch branches"
  - "Pattern: PII whitelist -- only http.url, http.method, http.status_code, http.duration, http.timeout_ms permitted; never request.body, request.headers, response.data, or request spread"
  - "Pattern: Level mapping -- 2xx success=info, non-2xx HTTPError=warn, TimeoutError=error, generic error=error"

requirements-completed: [HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 03 Plan 01: HTTP Block Enrichment Summary

**Four structured logger calls with nested http.* schema added to executeWebhookBlock.ts covering success (info), non-2xx (warn), timeout (error), and generic error (error) paths -- enabling Datadog HTTP loop detection with zero PII exposure**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T13:27:30Z
- **Completed:** 2026-02-27T13:29:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `logger.info('HTTP Request Executed', { http: { url, method, status_code, duration } })` on the success path after `logs.push({ status: 'success' })` and before `return` -- ChatLog push untouched
- Reshaped `logger.info('HTTP Request error', { statusCode, duration })` -> `logger.warn('HTTP Request Error', { http: { url, method, status_code, duration } })` -- correct level, nested schema, added url/method
- Reshaped `logger.warn('HTTP Request timeout', { timeout, duration })` -> `logger.error('HTTP Request Timeout', { http: { url, method, timeout_ms, duration } })` -- correct level, http.timeout_ms (no synthetic 408)
- Reshaped `logger.error(error)` -> `logger.error('HTTP Request Failed', { http: { url, method, duration }, error: safeMsg })` -- structured message, safe error extraction, no raw Error object
- Created 5-test Vitest suite asserting HTTP-01 (success schema), HTTP-02 (warn level + schema), HTTP-03 (error level + timeout_ms), HTTP-04 (info level), HTTP-05 (no PII keys)
- All 15 tests pass across packages/lib/ (5 logger, 5 block instrumentation, 5 HTTP instrumentation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add and reshape logger calls in executeWebhookBlock.ts** - `23fa7350` (feat)
2. **Task 2: Create Vitest test file for HTTP instrumentation schema assertions** - `ae46d1e7` (test)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified
- `packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts` - Added 4 structured logger calls with http.* nested schema (1 new success path, 3 reshaped error paths); all logs.push() ChatLog calls unchanged
- `packages/lib/http.instrumentation.test.ts` - 5 Vitest tests using tsx child processes covering HTTP-01 through HTTP-05 schema compliance and PII safety

## Decisions Made
- Placed success logger.info after `logs.push({ status: 'success' })` and before `return` -- this is the only valid position that (a) has access to `response.status` and (b) doesn't disrupt the ChatLog push
- Omitted `http.status_code: 408` from TimeoutError logger call -- 408 is a synthetic value emitted by the ChatLog UI for UX display; it is NOT a real server response; including it would create a misleading Datadog `http.status_code` facet showing 408 for all timeouts regardless of actual server behavior
- Used `request.timeout || 0` for `timeout_ms` -- `request.timeout` is typed as `number | false`; using `|| 0` safely converts `false` -> `0` with correct TypeScript type narrowing
- Used `error instanceof Error ? error.message : String(error)` for generic error serialization -- avoids passing raw Error objects to Winston (which serializes them poorly) and prevents stack trace exposure to Datadog

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all 4 logger calls matched plan specification exactly. PII check passed. All 15 tests passed on first run.

## User Setup Required
None - no external service configuration required. The logger calls activate with existing `DD_LOGS_ENABLED=true` infrastructure from Phase 1.

## Next Phase Readiness
- HTTP-01 through HTTP-05 requirements fully satisfied
- Every HTTP Request block execution now emits structured logs to stdout with Datadog-compatible schema
- Log levels correctly mapped: info (success), warn (non-2xx), error (timeout/generic)
- No PII exposure -- url, method, status_code, duration, timeout_ms only
- Ready for Phase 4 (trace injection) or next phase in sequence
- All 15 existing tests pass confirming no regressions

## Self-Check: PASSED

- FOUND: packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts (contains all 4 logger calls)
- FOUND: packages/lib/http.instrumentation.test.ts (5 tests)
- FOUND: commit 23fa7350 (feat(03-01): add structured http.* logger calls to executeWebhookBlock.ts)
- FOUND: commit ae46d1e7 (test(03-01): add Vitest schema assertions for HTTP instrumentation)

---
*Phase: 03-http-block-enrichment*
*Completed: 2026-02-27*
