# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every workflow execution produces a complete, queryable trace in Datadog — enabling detection of HTTP request loops and performance analysis per workflow.
**Current focus:** UAT feedback implemented — all 4 items complete

## Current Position

Phase: 4 of 4 (all phases complete)
Plan: All plans executed + UAT quick task complete
Status: UAT feedback implemented — ready for re-test in Datadog
Last activity: 2026-03-02 — UAT feedback implemented (quick task 1)

Progress: [█████████░] 95%

## UAT Feedback (2026-03-02)

User tested in real Datadog and needs these changes:

### 1. Message prefix with workspace name
- Current: `"Block Executed"`
- Wanted: `"${workspace_name} - Block Executed"`
- Affects: executeGroup.ts, executeWebhookBlock.ts

### 2. Workflow name field
- Current: only `workflow.id`
- Wanted: `workflow.name` added
- Source: `typebot.name` — NOT in TypebotInSession currently

### 3. Version field rename
- Current: `workflow.version`
- Wanted: `workflow.version_id` (renamed field)
- Affects: executeGroup.ts, all tests

### 4. All logs must include workspace context
- `workspace.name` and `workspace.id` on every log
- Source: `typebot.workspaceId` — NOT in TypebotInSession currently
- `workspace.name` — needs lookup or must be passed through session

### Key blocker
`TypebotInSession` schema (used in session state) does NOT include `name` or `workspaceId`.
These are stripped in `convertStartTypebotToTypebotInSession()` at `packages/bot-engine/startSession.ts:501`.

**Fix approach:**
1. Add `name` and `workspaceId` to TypebotInSession schema (in @typebot.io/schemas)
2. Include them in `convertStartTypebotToTypebotInSession()`
3. Update logger calls in executeGroup.ts and executeWebhookBlock.ts
4. Update all test fixtures
5. `workspace.name` may require a DB lookup unless it's available on the StartTypebot — needs investigation

**Resume with:** `/gsd:quick` or `/gsd:insert-phase` to implement these changes

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 2-3 min
- Total execution time: ~15 min

## Accumulated Context

### Decisions

- [Pre-roadmap]: Winston stays
- [Pre-roadmap]: Log all block types
- [Pre-roadmap]: JSON to stdout only
- [01-01]: DD_LOGS_ENABLED uses existing boolean Zod helper
- [01-01]: logger.ts reads process.env directly to avoid circular dependency
- [01-01]: defaultMeta limited to flat string fields only
- [02-01]: Block log placed after null executionResponse guard
- [02-01]: String(typebot.version) coercion for Datadog facet
- [03-01]: TimeoutError does NOT log http.status_code: 408
- [04-02]: dd.trace_id present on tRPC paths, absent on background jobs

### Pending Todos

None — all UAT feedback items implemented.

### Decisions (quick-1)

- [quick-1]: TypebotInSession uses Zod .and() intersection for optional logging fields (backward compat)
- [quick-1]: getTypebot() return type extended to include workspaceName to thread through session init
- [quick-1]: LogContext type in executeWebhookBlock.ts — executeWebhook() accepts optional logContext param
- [quick-1]: HTTP log execution_id is 'unknown' — sessionId not available without threading through executeIntegration

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Implement UAT feedback: add workspace/workflow context to all logs, rename version field, prefix messages with workspace_name | 2026-03-02 | cc98ee11 | [1-implement-uat-feedback-add-workspace-wor](./quick/1-implement-uat-feedback-add-workspace-wor/) |

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed quick task 1 — UAT feedback all 4 items implemented.
Resume with: Re-test in Datadog with the new log schema.
Resume file: .planning/quick/1-implement-uat-feedback-add-workspace-wor/1-SUMMARY.md
