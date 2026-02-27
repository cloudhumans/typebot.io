# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every workflow execution produces a complete, queryable trace in Datadog — enabling detection of HTTP request loops and performance analysis per workflow.
**Current focus:** Phase 3 — HTTP Block Enrichment

## Current Position

Phase: 3 of 4 (HTTP Block Enrichment)
Plan: 1 of 1 complete in current phase
Status: In progress
Last activity: 2026-02-27 — Plan 03-01 complete

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 2 min
- Total execution time: 8 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-logger-foundation | 2 | 4 min | 2 min |
| 02-block-instrumentation | 1 | 2 min | 2 min |
| 03-http-block-enrichment | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2min), 01-02 (2min), 02-01 (2min), 03-01 (2min)
- Trend: Consistent

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-roadmap]: Winston stays (migration to Pino rejected — no performance benefit given DB/HTTP bottlenecks, migration cost 1-2 days)
- [Pre-roadmap]: Log all block types (not just HTTP) to enable full execution trace per workflow in Datadog
- [Pre-roadmap]: JSON to stdout only — DD Agent DaemonSet already collects container stdout
- [01-01]: DD_LOGS_ENABLED uses existing boolean Zod helper -- no new type defined
- [01-01]: logger.ts reads process.env directly (not @typebot.io/env) to avoid circular dependency risk
- [01-01]: defaultMeta limited to flat string fields only -- nested objects risk shallow-merge overwrite
- [01-02]: tsx (not bare node) required for child process TypeScript logger loading -- plain node cannot require .ts files
- [01-02]: tsx binary resolved as absolute path to avoid PATH lookup issues in CI environments
- [02-01]: Block log call placed after null executionResponse guard -- satisfies BLOCK-04 naturally without deduplication logic
- [02-01]: String(typebot.version ?? 'unknown') coercion prevents Datadog numeric facet mismatch
- [02-01]: No deduplication Set needed -- Declare Variables re-entry per user turn is a distinct execution
- [03-01]: TimeoutError does NOT log http.status_code: 408 -- 408 is synthetic ChatLog value, not real server response
- [03-01]: request.timeout || 0 coercion -- request.timeout is number|false; || 0 safely converts false->0
- [03-01]: Generic error uses error instanceof Error ? error.message : String(error) for PII-safe serialization

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: `dd.trace_id` injection may be absent on non-tRPC paths due to lazy `dd-trace` init order — must confirm or document during Phase 4

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 03-01-PLAN.md (HTTP block enrichment -- structured http.* logger calls and schema tests)
Resume file: None
