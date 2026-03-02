---
phase: quick-2
plan: 01
subsystem: bot-engine/logging
tags: [logging, datadog, execution-id, typebot-history, tracing]
dependency_graph:
  requires: [quick-1]
  provides: [EXEC-ID-FIX, WEBHOOK-SESSION-THREAD, TYPEBOT-HISTORY-ID]
  affects: [executeGroup.ts, executeWebhookBlock.ts, executeIntegration.ts, startSession.ts, TypebotInSession, findLatestTypebotHistory]
tech_stack:
  added: []
  patterns: [result-id-as-session-id, sessionId-threading, prisma-history-query]
key_files:
  created:
    - packages/bot-engine/queries/findLatestTypebotHistory.ts
  modified:
    - packages/schemas/features/chat/shared.ts
    - packages/bot-engine/startSession.ts
    - packages/bot-engine/executeIntegration.ts
    - packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
    - packages/bot-engine/executeGroup.ts
    - packages/lib/executeGroup.instrumentation.test.ts
    - packages/lib/http.instrumentation.test.ts
    - packages/lib/schema.validation.test.ts
decisions:
  - "result?.id passed as sessionId to startBotFlow — for published workflows this is a CUID (always set); for preview result is undefined so sessionId falls back to 'preview'"
  - "typebotHistoryId queried only for non-preview sessions (startParams.type !== 'preview') to avoid unnecessary DB calls"
  - "version_typebot_history_id uses 'unknown' fallback (not undefined) for consistent Datadog field presence"
metrics:
  duration: "8 minutes"
  completed: "2026-03-02"
  tasks: 2
  files_modified: 8
---

# Quick Task 2: Fix execution_id 'preview'/'unknown' and Add version_typebot_history_id Summary

**One-liner:** Fixed execution_id for published workflow block logs (was 'preview', now resultId CUID) and HTTP webhook logs (was 'unknown', now sessionId CUID), and added version_typebot_history_id from TypebotHistory table to all Datadog log events.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix execution_id 'preview' and 'unknown', add version_typebot_history_id | 148462f3 | findLatestTypebotHistory.ts, shared.ts, startSession.ts, executeIntegration.ts, executeWebhookBlock.ts, executeGroup.ts |
| 2 | Update tests to validate new fields and fixed execution_id values | 4c065b99 | executeGroup.instrumentation.test.ts, http.instrumentation.test.ts, schema.validation.test.ts |

## What Was Built

### Fix 1: execution_id 'preview' in published workflow block logs

**Root cause:** `startBotFlow()` was called without a `sessionId` parameter in `startSession.ts`. Since `startBotFlow` already accepted `sessionId?: string` and threaded it through to `executeGroup`, the only missing piece was passing `result?.id` at the call site.

**Fix:** Added `sessionId: result?.id` to the `startBotFlow()` call in `startSession.ts` (line 198). For published workflows, `result` is always defined with a CUID id. For preview mode, `result` is `undefined` (the `getResult()` function returns early with `if (isPreview) return`), so `sessionId` is `undefined`, and `executeGroup` correctly falls back to `'preview'` via `sessionId ?? 'preview'`.

### Fix 2: execution_id 'unknown' in HTTP webhook logs

**Root cause:** `executeIntegration.ts` receives `sessionId` as a parameter (already threaded from `executeGroup`) but was not forwarding it to `executeWebhookBlock()` calls.

**Fix:** Added `sessionId` to the options object in both `executeWebhookBlock` call sites in `executeIntegration.ts` (Zapier/Make.com/Pabbly and Webhook cases). Updated the `Params` type in `executeWebhookBlock.ts` to accept `sessionId?: string`, and used `params.sessionId ?? 'unknown'` in the `logContext.workflow.execution_id` field.

### Fix 3: version_typebot_history_id field

**New query:** Created `packages/bot-engine/queries/findLatestTypebotHistory.ts` — a Prisma query that fetches the most recently published TypebotHistory record id for a given typebotId.

**Schema extension:** Added `typebotHistoryId: z.string().optional()` to `sessionLoggingFieldsSchema` in `shared.ts`, preserving backward compatibility with existing serialized sessions via the `.and()` intersection.

**Threading:** In `startSession.ts`, after the result creation, queries `findLatestTypebotHistory` (only for non-preview sessions) and passes the result to `convertStartTypebotToTypebotInSession()`. The function signature was extended to accept `typebotHistoryId?: string` and include it in both `version === '6'` and legacy branches of the returned `TypebotInSession`.

**Log emission:** Both `executeGroup.ts` and `executeWebhookBlock.ts` now include `version_typebot_history_id: typebot.typebotHistoryId ?? 'unknown'` in their `workflow` log context objects.

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

All 19 tests pass:
- `packages/lib/executeGroup.instrumentation.test.ts`: 7 tests (6 existing updated + 1 new HIST-01 test)
- `packages/lib/http.instrumentation.test.ts`: 6 tests (all fixtures updated with version_typebot_history_id and real execution_ids)
- `packages/lib/schema.validation.test.ts`: 6 tests (workflowFields schema updated, assertions added for version_typebot_history_id)

## Self-Check: PASSED

Files created:
- packages/bot-engine/queries/findLatestTypebotHistory.ts — FOUND
- .planning/quick/2-fix-execution-id-preview-unknown-for-pub/2-SUMMARY.md — FOUND

Commits:
- 148462f3 — FOUND (feat(quick-2): fix execution_id preview/unknown, add version_typebot_history_id)
- 4c065b99 — FOUND (test(quick-2): update instrumentation tests for version_typebot_history_id)
