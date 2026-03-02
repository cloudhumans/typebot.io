---
phase: quick-uat-feedback
plan: 1
subsystem: bot-engine/logging
tags: [logging, datadog, uat, schema, workspace-context]
dependency_graph:
  requires: [04-02]
  provides: [UAT-01, UAT-02, UAT-03, UAT-04]
  affects: [executeGroup.ts, executeWebhookBlock.ts, TypebotInSession, startSession]
tech_stack:
  added: []
  patterns: [zod-and-intersection, optional-fields-backward-compat, logcontext-param]
key_files:
  created: []
  modified:
    - packages/schemas/features/chat/shared.ts
    - packages/schemas/features/chat/schema.ts
    - packages/bot-engine/queries/findPublicTypebot.ts
    - packages/bot-engine/queries/findTypebot.ts
    - packages/bot-engine/startSession.ts
    - packages/bot-engine/executeGroup.ts
    - packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
    - packages/lib/executeGroup.instrumentation.test.ts
    - packages/lib/http.instrumentation.test.ts
    - packages/lib/schema.validation.test.ts
decisions:
  - "TypebotInSession uses .and() Zod intersection for optional logging fields (backward compat with existing serialized sessions)"
  - "getTypebot() return type extended to StartTypebot & { workspaceName?: string } to thread workspace name through session init"
  - "LogContext type scoped to executeWebhookBlock.ts — executeWebhook() accepts optional logContext param to avoid breaking callers"
  - "execution_id for HTTP logs is 'unknown' — sessionId not available in executeWebhookBlock without threading through executeIntegration"
metrics:
  duration: "8 minutes"
  completed: "2026-03-02"
  tasks: 2
  files_modified: 10
---

# Phase quick-uat-feedback Plan 1: UAT Feedback — Workspace Context and Log Schema Enrichment Summary

**One-liner:** Added workspace name/id to TypebotInSession schema and enriched all DD logs with workspace context, workflow.name, version_id rename, and workspace-name message prefix.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend TypebotInSession schema and plumb workspace context | 1be260e9 | shared.ts, schema.ts, findPublicTypebot.ts, findTypebot.ts, startSession.ts |
| 2 | Update logger calls and tests | 0319d510 | executeGroup.ts, executeWebhookBlock.ts, 3 test files |

## What Was Built

### Task 1 — Schema and Query Changes

**`packages/schemas/features/chat/shared.ts`**
- Split `typebotInSessionStateSchema` into base + logging fields
- Used Zod `.and()` intersection to add optional `name`, `workspaceId`, `workspaceName` fields
- All optional — backward compatible with existing serialized sessions in Redis/DB

**`packages/schemas/features/chat/schema.ts`**
- Added `name` and `workspaceId` to `startTypebotPick` — these exist on `typebotV5Schema`/`typebotV6Schema`

**`packages/bot-engine/queries/findPublicTypebot.ts`**
- Added `typebot.name: true`, `typebot.workspaceId: true` to select
- Added `workspace.name: true` to workspace select

**`packages/bot-engine/queries/findTypebot.ts`**
- Added `name: true`, `workspaceId: true` to select
- Added full `workspace: { select: { name: true } }` join

**`packages/bot-engine/startSession.ts`**
- `getTypebot()` return type changed to `StartTypebot & { workspaceName?: string }`
- Extracts `workspaceName` from query results (from public typebot workspace or preview typebot workspace)
- Destructures `workspaceName` at call site with `const { workspaceName, ...typebot } = await getTypebot(startParams)`
- `convertStartTypebotToTypebotInSession()` accepts `workspaceName?` third parameter and injects `name`, `workspaceId`, `workspaceName` into both v5 and v6 branches

### Task 2 — Logger Calls and Tests

**`packages/bot-engine/executeGroup.ts`**
- Message: `'Block Executed'` → `` `${workspaceName} - Block Executed` ``
- Added `workspace: { id, name }` object
- Added `workflow.name` field
- Renamed `workflow.version` → `workflow.version_id`

**`packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`**
- Added `LogContext` type with `workspace` and `workflow` sub-objects
- `executeWebhook()` signature extended with optional `logContext?: LogContext`
- `executeWebhookBlock()` constructs `logContext` from `state.typebotsQueue[0].typebot`
- All 4 logger calls updated: prefixed message, spread `logContext`, `workflow.version_id`

**Test files (3 files, 18 tests total — all green):**
- `executeGroup.instrumentation.test.ts`: 6 tests covering UAT-01/02/03/04 assertions
- `http.instrumentation.test.ts`: 6 tests with workspace/workflow context and prefixed messages
- `schema.validation.test.ts`: 6 tests with updated DD_SCHEMA fixture (workspaceFields added, version renamed)

## Success Criteria Met

- [x] Every "Block Executed" log message starts with "${workspace_name} - "
- [x] Every "HTTP Request *" log message starts with "${workspace_name} - "
- [x] All logs contain workspace.id and workspace.name fields
- [x] All logs contain workflow.name field
- [x] workflow.version renamed to workflow.version_id everywhere (code + tests)
- [x] TypebotInSession backward-compatible (optional fields, existing sessions don't break)
- [x] All 3 test files pass with green (18/18 tests)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

**Files exist:**
- packages/schemas/features/chat/shared.ts — FOUND
- packages/bot-engine/executeGroup.ts — FOUND
- packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts — FOUND
- packages/lib/executeGroup.instrumentation.test.ts — FOUND
- packages/lib/http.instrumentation.test.ts — FOUND
- packages/lib/schema.validation.test.ts — FOUND

**Commits exist:**
- 1be260e9 — feat(quick-uat-feedback-1): extend TypebotInSession schema — FOUND
- 0319d510 — feat(quick-uat-feedback-1): update logger calls — FOUND

**Tests:** 18/18 passing
