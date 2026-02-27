---
phase: 04-schema-validation-and-performance
plan: 01
subsystem: infra
tags: [winston, datadog, logging, schema-validation, performance, vitest, tsx]

# Dependency graph
requires:
  - phase: 01-logger-foundation/01-01
    provides: Winston logger with defaultMeta ddsource/service
  - phase: 01-logger-foundation/01-02
    provides: tsx child-process test pattern, Vitest test infrastructure
  - phase: 02-block-instrumentation/02-01
    provides: Block Executed log message schema
  - phase: 03-http-block-enrichment/03-01
    provides: HTTP Request Executed/Error/Timeout/Failed log message schema
provides:
  - DD pipeline schema fixture assertions for all 5 log message types (VAL-01)
  - Performance benchmark confirming 20 logger calls complete under 50ms (VAL-02)
affects: [05-datadog-monitor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "spawnSync used for benchmark (vs execSync) to separate stdout JSON logs from stderr timing"
    - "process.stderr.write() for timing output -- avoids Winston console redirect (lines 51-55 of logger.ts)"
    - "typeof assertions for value types -- more explicit than toMatchObject which only checks presence"
    - "Inline script string hardcodes benchmark payload -- avoids tsx -e argv ambiguity"

key-files:
  created:
    - packages/lib/schema.validation.test.ts
  modified: []

key-decisions:
  - "spawnSync used for benchmark instead of execSync -- allows stderr (timing) to be read separately from stdout (JSON logs)"
  - "process.stderr.write('ELAPSED:'+elapsed) for timing -- console methods are redirected to Winston in production mode, would emit JSON to stdout instead"
  - "typeof assertions used instead of toMatchObject -- explicit value type checking per plan spec (field presence + nesting depth + value types)"
  - "http.status_code asserted undefined for TimeoutError -- confirms no synthetic 408 leaks into Datadog facet"

requirements-completed: [VAL-01, VAL-02]

# Metrics
duration: 3min
completed: 2026-02-27
---

# Phase 04 Plan 01: DD Pipeline Schema Fixture and Performance Benchmark Summary

**Vitest schema fixture asserting all 5 log message types against DD pipeline contract (field presence, nesting depth, value types) plus a 20-call performance benchmark confirming sub-50ms logging overhead -- 21 total tests pass across packages/lib/**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T11:30:00Z
- **Completed:** 2026-02-27T11:33:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created `packages/lib/schema.validation.test.ts` using established `runLoggerScript` child-process pattern from `logger.test.ts`
- Defined DD pipeline schema fixture as TypeScript object with `topLevel`, `ddsource`, `service`, `workflowFields`, `typebotBlockFields`, `httpSuccessFields`, `httpTimeoutFields`
- 5 schema fixture tests (VAL-01): Block Executed, HTTP Request Executed, HTTP Request Error, HTTP Request Timeout, HTTP Request Failed -- all asserting field presence, nesting depth (`typeof result.workflow === 'object'`), and value types (`typeof` assertions)
- Confirmed TimeoutError has no `http.status_code` (no synthetic 408 in Datadog facet)
- Confirmed "HTTP Request Failed" `error` field is `string` not raw Error object
- 1 benchmark test (VAL-02): uses `spawnSync` + `process.stderr.write` to time 20 sequential `logger.info` calls -- asserts elapsed < 50ms
- All 21 tests pass: 5 logger + 5 block instrumentation + 5 HTTP instrumentation + 6 schema/benchmark

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Schema fixture tests and performance benchmark** - `77926e73` (test)

## Files Created/Modified

- `packages/lib/schema.validation.test.ts` - 6 Vitest tests: 5 schema fixture (VAL-01) + 1 benchmark (VAL-02); uses runLoggerScript (execSync) for schema tests and spawnSync for benchmark

## Decisions Made

- Used `spawnSync` for benchmark -- allows stderr (timing value) to be read separately from stdout (JSON log entries from Winston)
- Used `process.stderr.write('ELAPSED:...')` not `console.error` -- logger.ts redirects all console methods to Winston in production mode, which would emit JSON to stdout and corrupt timing measurement
- Used explicit `typeof` assertions -- more precise than `toMatchObject` which only checks presence, not value types
- Asserted `http.status_code` is `undefined` in Timeout test -- confirms the Phase 3 decision (no synthetic 408) is preserved end-to-end

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All 6 tests passed on first run. Benchmark measured well under 50ms threshold (Console transport is synchronous, overhead is minimal).

## Self-Check: PASSED

- FOUND: packages/lib/schema.validation.test.ts (169 lines, 6 tests)
- FOUND: commit 77926e73 (test(04-01): add DD pipeline schema fixture and performance benchmark)
- All 21 tests pass across packages/lib/

---
*Phase: 04-schema-validation-and-performance*
*Completed: 2026-02-27*
