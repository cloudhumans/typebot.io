# Roadmap: Typebot Structured Logging for Datadog

## Overview

This project instruments an existing Typebot execution engine to emit structured JSON logs that match a pre-configured Datadog pipeline contract. The dependency chain is strict: the logger foundation must emit correct JSON before any call-site work begins, block execution instrumentation establishes the base schema for all block types, HTTP block enrichment layers in the http.* fields required by the HTTP loop detection monitor, and a final validation phase confirms schema correctness and performance before production deploy. Four phases, two primary files changed, zero new dependencies.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Logger Foundation** - Logger emits correct JSON schema with static DD fields; env vars validated at startup
- [ ] **Phase 2: Block Instrumentation** - All logic and integration blocks emit structured workflow.* and typebot_block.* logs from executeGroup
- [ ] **Phase 3: HTTP Block Enrichment** - HTTP Request block logs emit schema-compliant http.* fields with correct log levels and no PII
- [ ] **Phase 4: Schema Validation and Performance** - Unit tests confirm schema correctness against DD pipeline fixture; benchmark confirms no latency regression

## Phase Details

### Phase 1: Logger Foundation
**Goal**: The logging infrastructure emits valid schema-compliant JSON with correct static fields, and misconfigured env vars fail at startup rather than silently degrading
**Depends on**: Nothing (first phase)
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04
**Success Criteria** (what must be TRUE):
  1. Running `DD_LOGS_ENABLED=true NODE_ENV=production` produces single-line JSON on stdout (no colorized text, no multi-line format)
  2. Every log entry contains top-level `ddsource: "nodejs"` and `service: "typebot-runner"` fields
  3. Nested metadata objects (e.g., `{ workflow: { id: "x" } }`) serialize as nested JSON keys, not flattened strings
  4. Starting the app with `DD_LOGS_ENABLED=invalid` or a missing `LOG_LEVEL` causes an immediate startup error with a clear message
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Add env vars to Zod schema and defaultMeta to Winston logger
- [ ] 01-02-PLAN.md — Unit test verifying JSON output, static fields, and nested serialization

### Phase 2: Block Instrumentation
**Goal**: Every logic block and integration block execution emits a structured log with full workflow context and block identity, with no duplicate entries from recursive executeGroup re-entry
**Depends on**: Phase 1
**Requirements**: BLOCK-01, BLOCK-02, BLOCK-03, BLOCK-04
**Success Criteria** (what must be TRUE):
  1. Executing a 5-block workflow produces exactly one log entry per logic or integration block (no duplicates from Declare Variables re-entry)
  2. Each log entry contains `workflow.id`, `workflow.version`, and `workflow.execution_id` matching the executing session
  3. Each log entry contains `typebot_block.id` and `typebot_block.type` identifying the specific block
  4. Each log entry `message` field reads exactly `"Block Executed"` (deterministic vocabulary, no ad-hoc strings)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: HTTP Block Enrichment
**Goal**: HTTP Request block logs emit the full http.* schema on all execution paths (success, error, timeout) with correct log levels and no PII or secrets in logged fields
**Depends on**: Phase 2
**Requirements**: HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05
**Success Criteria** (what must be TRUE):
  1. A successful HTTP Request block execution produces a log with `http.url`, `http.method`, `http.status_code`, and `http.duration` at `logger.info` level
  2. A non-2xx HTTP response produces a log with `http.url`, `http.method`, and `http.status_code` at `logger.warn` level
  3. An HTTP timeout produces a log with `http.url`, `http.method`, and timeout detail at `logger.error` level
  4. None of the HTTP log entries contain request body, response body, or any request header values (PII/secrets protection)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Schema Validation and Performance
**Goal**: All instrumented log paths are verified against the Datadog pipeline schema fixture by automated tests, performance regression is confirmed absent, and the dd.trace_id injection status is known and documented
**Depends on**: Phase 3
**Requirements**: VAL-01, VAL-02, VAL-03
**Success Criteria** (what must be TRUE):
  1. A unit test captures stdout from all instrumented paths, parses the JSON, and asserts field presence, correct nesting depth, and correct value types against the DD pipeline schema fixture — and the test passes
  2. A benchmark of a 20-block workflow execution with logging enabled shows no measurable p99 latency regression vs. baseline without logging
  3. The status of `dd.trace_id` injection (present or absent due to initialization order) is confirmed and documented in PROJECT.md Key Decisions
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Logger Foundation | 1/2 | In progress | - |
| 2. Block Instrumentation | 0/TBD | Not started | - |
| 3. HTTP Block Enrichment | 0/TBD | Not started | - |
| 4. Schema Validation and Performance | 0/TBD | Not started | - |
