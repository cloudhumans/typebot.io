# Typebot Structured Logging for Datadog

## What This Is

Structured JSON logging instrumentation for a Typebot fork running on EKS. Every block execution in a workflow emits a JSON log to stdout with workflow context, block metadata, and (for HTTP blocks) request/response details. The Datadog Agent DaemonSet already collects stdout — this project makes those logs useful by giving them structure that matches an existing Datadog pipeline.

## Core Value

Every workflow execution produces a complete, queryable trace in Datadog — enabling detection of HTTP request loops and performance analysis per workflow.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] All block types emit structured JSON logs on execution with workflow_id, execution_id, and block metadata
- [ ] HTTP Request blocks emit additional http.* fields (url, method, status_code, duration)
- [ ] Failed HTTP requests log error message and status code
- [ ] Log schema matches the Datadog pipeline contract (ddsource, service, workflow.*, http.*, typebot_block.*)
- [ ] Logging library outputs JSON to stdout (DD Agent collects container stdout)
- [ ] No performance regression on workflow execution from logging overhead

### Out of Scope

- Datadog pipeline/metric/monitor/dashboard configuration — already configured separately
- Datadog Agent DaemonSet setup — already running on EKS
- Datadog-Slack integration — already working
- APM/tracing instrumentation (OpenTelemetry, dd-trace) — logs only for now
- Log shipping infrastructure changes — DD Agent handles this

## Context

**Codebase location:** All execution logic lives in `packages/bot-engine/`:
- `executeGroup.ts` — main block execution loop (dispatches per block type)
- `executeIntegration.ts` — routes integration blocks (webhook, Google Sheets, email, etc.)
- `executeLogic.ts` — routes logic blocks (condition, set variable, script, etc.)
- `blocks/integrations/webhook/executeWebhookBlock.ts` — HTTP Request block execution
- `startBotFlow.ts` / `continueBotFlow.ts` — workflow entry points

**Log schema contract (Datadog pipeline expects this):**
```json
{
  "ddsource": "nodejs",
  "service": "typebot-runner",
  "message": "<block type> Executed",
  "workflow": {
    "id": "<typebot_id>",
    "version": "<version>",
    "execution_id": "<session_id>"
  },
  "http": {
    "url": "<request_url>",
    "method": "<HTTP_METHOD>",
    "status_code": 200,
    "duration": 450
  },
  "typebot_block": {
    "id": "<block_id>",
    "type": "<block_type>"
  }
}
```

`http.*` fields only present for HTTP Request (webhook) blocks. All other blocks emit `workflow.*` + `typebot_block.*` + `message`.

**Environment:** Typebot fork on AWS EKS, Datadog Agent DaemonSet collecting container stdout, existing DD pipelines/metrics/monitors/dashboards already configured.

## Constraints

- **Log format**: Must match the exact schema above — Datadog pipeline is already configured to parse it
- **Output target**: stdout only — DD Agent collects from container logs
- **Performance**: Logging must not add noticeable latency to block execution (use async/buffered JSON logger)
- **Brownfield**: Instrument existing execution paths without refactoring block execution flow

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Winston (reject Pino migration) | Already installed, wired to 13 files — 4x perf difference irrelevant when logging follows DB/HTTP I/O | Decided |
| Log all block types, not just HTTP | Enables full execution trace per workflow in DD | Decided |
| JSON to stdout (no sidecar/forwarder changes) | DD Agent DaemonSet already collects stdout | Decided |
| Hook at executeGroup level only | Only place with full context (sessionId, typebotId, block); deeper hooks require 20+ signature changes | Decided |
| dd.trace_id injection is present when dd-trace is initialized before Winston (tRPC request paths); absent on non-tRPC paths (background jobs) where dd-trace lazy init has not run. This is a pre-existing limitation. Primary log correlation uses workflow.id/execution_id which is always present. | Empirically confirmed via verify-trace-injection.ts — dd key present in Scenario A (dd-trace first), absent in Scenario B (no dd-trace init). Phase 4 (VAL-03) | Decided |

---
*Last updated: 2026-02-27 after Phase 4 dd.trace_id verification*
