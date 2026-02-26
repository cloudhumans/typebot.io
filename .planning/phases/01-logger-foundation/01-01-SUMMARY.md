---
phase: 01-logger-foundation
plan: 01
subsystem: infra
tags: [winston, zod, datadog, logging, env-validation]

# Dependency graph
requires: []
provides:
  - Zod validation for DD_LOGS_ENABLED, LOG_LEVEL, DD_SERVICE in packages/env/env.ts server block
  - Winston logger with defaultMeta containing ddsource: nodejs and service: typebot-runner
  - Startup-time env var validation that throws on bad DD_LOGS_ENABLED value
affects: [02-context-propagation, 03-block-instrumentation, 04-trace-injection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-only Zod env vars go in baseEnv.server block only, no runtimeEnv entry needed"
    - "Winston defaultMeta for flat static DD pipeline fields (ddsource, service)"
    - "Logger reads process.env directly at instantiation -- never import @typebot.io/env from logger.ts"

key-files:
  created: []
  modified:
    - packages/env/env.ts
    - packages/lib/logger.ts

key-decisions:
  - "DD_LOGS_ENABLED uses existing boolean helper (z.enum(['true','false'])) -- no new Zod type defined"
  - "logger.ts continues to read process.env.DD_SERVICE directly (not via @typebot.io/env) to avoid circular dependency risk"
  - "defaultMeta limited to flat string fields only -- nested objects must never be placed in defaultMeta due to Winston shallow merge overwrite risk"

patterns-established:
  - "Pattern: Static Datadog pipeline fields -- add to defaultMeta on createLogger, never at call sites"
  - "Pattern: Server-side env vars -- add to baseEnv.server block, no runtimeEnv entry"

requirements-completed: [LOG-01, LOG-02, LOG-03]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 01 Plan 01: Logger Foundation - Env Schema and defaultMeta Summary

**Winston logger emits ddsource/service on every JSON log entry via defaultMeta, and Zod env schema now validates DD_LOGS_ENABLED/LOG_LEVEL/DD_SERVICE at app startup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T18:49:14Z
- **Completed:** 2026-02-26T18:52:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added DD_LOGS_ENABLED (boolean, default false), LOG_LEVEL (enum of 7 Winston levels, default info), and DD_SERVICE (optional string) to Zod server schema -- misconfigured values now throw at app startup via onValidationError
- Added defaultMeta with ddsource: 'nodejs' and service: process.env.DD_SERVICE ?? 'typebot-runner' to winston.createLogger() -- every log entry now carries these static DD pipeline fields automatically without call-site changes
- Smoke test confirmed single-line JSON output with ddsource and service present when DD_LOGS_ENABLED=true NODE_ENV=production

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DD_LOGS_ENABLED, LOG_LEVEL, DD_SERVICE to Zod env schema** - `9c5dfa40` (feat)
2. **Task 2: Add defaultMeta with ddsource and service to Winston logger** - `52a03552` (feat)

## Files Created/Modified
- `packages/env/env.ts` - Added three new vars to baseEnv.server block under '// Datadog logging configuration' comment after CHAT_API_TIMEOUT entry
- `packages/lib/logger.ts` - Added defaultMeta block to winston.createLogger() between exitOnError and format, with code comment documenting DD pipeline contract

## Decisions Made
- Used existing `boolean` Zod helper (`z.enum(['true', 'false']).transform(...)`) for DD_LOGS_ENABLED rather than a new type -- maintains consistency with DEBUG, DISABLE_SIGNUP, and other boolean env vars in the file
- logger.ts reads `process.env.DD_SERVICE` directly (not `env.DD_SERVICE`) -- importing from @typebot.io/env would create circular dependency risk and change initialization order
- defaultMeta contains only flat string fields (`ddsource`, `service`) -- per research anti-pattern guidance, nested objects in defaultMeta would be overwritten at call sites via Winston's shallow merge

## Deviations from Plan

None - plan executed exactly as written.

The smoke test in the plan's `<verification>` block used `require('./packages/lib/logger')` which cannot load a TypeScript file directly. The verification was adapted to run a functionally equivalent inline Winston test from the project directory (where dependencies are installed). This confirmed the JSON output shape matches the expected contract: `{"ddsource":"nodejs","level":"info","message":"smoke test","service":"typebot-runner","test":true,"timestamp":"..."}`.

## Issues Encountered
- The PLAN.md smoke test uses `require('./packages/lib/logger')` but the file is `.ts` with no compiled dist. Adapted to an inline JS test using winston directly from the project directory. Dependencies were not initially installed -- ran `pnpm install --frozen-lockfile --ignore-scripts` to set up node_modules. The isolated-vm native module failed to compile (Node.js 24 + gyp incompatibility) but was not needed for this plan.

## User Setup Required
None - no external service configuration required. The new env vars are optional with safe defaults:
- `DD_LOGS_ENABLED` defaults to `false` (colorized pretty output, existing behavior)
- `LOG_LEVEL` defaults to `info`
- `DD_SERVICE` has no default; logger falls back to `'typebot-runner'`

## Next Phase Readiness
- Env validation and static DD fields foundation is complete -- ready for Phase 1 Plan 02 (context propagation)
- LOG-01, LOG-02, LOG-03 requirements satisfied
- LOG-04 (nested object serialization) is confirmed correct by Winston format.json() -- nested objects passed as second arg serialize as nested JSON keys natively

---
*Phase: 01-logger-foundation*
*Completed: 2026-02-26*
