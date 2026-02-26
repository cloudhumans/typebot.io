# Requirements: Typebot Structured Logging for Datadog

**Defined:** 2026-02-26
**Core Value:** Every workflow execution produces a complete, queryable trace in Datadog — enabling detection of HTTP request loops and performance analysis per workflow.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Logger Foundation

- [x] **LOG-01**: Logger emits valid single-line JSON to stdout when `DD_LOGS_ENABLED=true`
- [x] **LOG-02**: Every log entry includes `ddsource: "nodejs"` and `service: "typebot-runner"` as top-level fields
- [x] **LOG-03**: `DD_LOGS_ENABLED` and `LOG_LEVEL` are validated via Zod env schema — app fails on startup if misconfigured
- [ ] **LOG-04**: Nested metadata objects serialize as nested JSON keys (not flattened) matching DD pipeline contract

### Block Instrumentation

- [ ] **BLOCK-01**: Every logic and integration block execution emits a structured log with `workflow.id`, `workflow.version`, `workflow.execution_id`
- [ ] **BLOCK-02**: Every block log includes `typebot_block.id` and `typebot_block.type`
- [ ] **BLOCK-03**: Block log `message` field uses deterministic vocabulary: `"Block Executed"`
- [ ] **BLOCK-04**: No duplicate log entries from recursive `executeGroup` re-entry (Declare Variables pattern)

### HTTP Block Enrichment

- [ ] **HTTP-01**: HTTP Request block success logs include `http.url`, `http.method`, `http.status_code`, `http.duration`
- [ ] **HTTP-02**: HTTP Request block error logs include `http.url`, `http.method`, `http.status_code`, error message
- [ ] **HTTP-03**: HTTP Request block timeout logs include `http.url`, `http.method`, timeout detail
- [ ] **HTTP-04**: HTTP logs use correct log levels: `logger.info` for 2xx, `logger.warn` for non-2xx, `logger.error` for timeouts/failures
- [ ] **HTTP-05**: HTTP logs never include request bodies, response bodies, or headers (PII/secrets protection)

### Validation

- [ ] **VAL-01**: Unit test validates JSON output matches DD pipeline schema fixture (field presence, nesting depth, value types)
- [ ] **VAL-02**: Performance benchmark confirms no measurable p99 latency regression on a 20-block workflow
- [ ] **VAL-03**: `dd.trace_id` injection status confirmed and documented

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Observability Enhancements

- **OBS-01**: `typebot_block.duration_ms` field for per-block latency percentile dashboards
- **OBS-02**: `typebot_block.outgoing_edge_id` for conditional branch tracking
- **OBS-03**: HTTP URL query string sanitization to prevent credential leakage
- **OBS-04**: Forged block `typebot_block.action` sub-field for per-integration action tracking
- **OBS-05**: Header/authorization redaction beyond URL sanitization
- **OBS-06**: Bubble/input block logging at `debug` level (currently excluded from per-entry logging)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Datadog pipeline/metric/monitor/dashboard config | Already configured separately by user |
| Datadog Agent DaemonSet setup | Already running on EKS |
| Datadog-Slack integration | Already working |
| APM/tracing instrumentation (OpenTelemetry) | Logs only — dd-trace already installed for log injection |
| Log shipping infrastructure changes | DD Agent handles stdout collection |
| Migration to Pino | Winston already installed, wired to 13 files — migration cost unjustified |
| Request/response body logging | PII/secrets risk — anti-feature |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOG-01 | Phase 1 | Complete (01-01) |
| LOG-02 | Phase 1 | Complete (01-01) |
| LOG-03 | Phase 1 | Complete (01-01) |
| LOG-04 | Phase 1 | Pending |
| BLOCK-01 | Phase 2 | Pending |
| BLOCK-02 | Phase 2 | Pending |
| BLOCK-03 | Phase 2 | Pending |
| BLOCK-04 | Phase 2 | Pending |
| HTTP-01 | Phase 3 | Pending |
| HTTP-02 | Phase 3 | Pending |
| HTTP-03 | Phase 3 | Pending |
| HTTP-04 | Phase 3 | Pending |
| HTTP-05 | Phase 3 | Pending |
| VAL-01 | Phase 4 | Pending |
| VAL-02 | Phase 4 | Pending |
| VAL-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16 (roadmap created 2026-02-26)
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after 01-01 execution (LOG-01, LOG-02, LOG-03 complete)*
