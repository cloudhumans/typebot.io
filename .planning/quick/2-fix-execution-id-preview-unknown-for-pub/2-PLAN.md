---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/bot-engine/startSession.ts
  - packages/bot-engine/executeIntegration.ts
  - packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
  - packages/bot-engine/executeGroup.ts
  - packages/bot-engine/queries/findLatestTypebotHistory.ts
  - packages/schemas/features/chat/shared.ts
  - packages/lib/executeGroup.instrumentation.test.ts
  - packages/lib/http.instrumentation.test.ts
  - packages/lib/schema.validation.test.ts
autonomous: true
requirements: [EXEC-ID-FIX, WEBHOOK-SESSION-THREAD, TYPEBOT-HISTORY-ID]

must_haves:
  truths:
    - "Published workflow logs emit execution_id equal to resultId (a CUID), never 'preview'"
    - "HTTP webhook logs emit execution_id equal to sessionId, never 'unknown'"
    - "All logs include workflow.version_typebot_history_id from the latest TypebotHistory record"
    - "Existing workflow.version_id field remains unchanged"
    - "Preview mode still correctly shows execution_id as 'preview'"
  artifacts:
    - path: "packages/bot-engine/queries/findLatestTypebotHistory.ts"
      provides: "Prisma query to fetch latest TypebotHistory.id by typebotId"
      exports: ["findLatestTypebotHistory"]
    - path: "packages/bot-engine/startSession.ts"
      provides: "Passes result.id as sessionId to startBotFlow; queries and threads typebotHistoryId"
    - path: "packages/bot-engine/executeIntegration.ts"
      provides: "Passes sessionId through to executeWebhookBlock"
    - path: "packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts"
      provides: "Accepts sessionId param; uses it in logContext.workflow.execution_id and version_typebot_history_id"
    - path: "packages/schemas/features/chat/shared.ts"
      provides: "TypebotInSession with optional typebotHistoryId field"
  key_links:
    - from: "packages/bot-engine/startSession.ts"
      to: "startBotFlow"
      via: "sessionId: result?.id parameter"
      pattern: "sessionId:\\s*result\\?\\.id"
    - from: "packages/bot-engine/executeIntegration.ts"
      to: "executeWebhookBlock"
      via: "sessionId parameter forwarding"
      pattern: "executeWebhookBlock\\(state,\\s*block,\\s*\\{[^}]*sessionId"
    - from: "packages/bot-engine/startSession.ts"
      to: "findLatestTypebotHistory"
      via: "query call in getTypebot flow"
      pattern: "findLatestTypebotHistory"
---

<objective>
Fix three instrumentation gaps: (1) execution_id shows 'preview' for published workflows because sessionId is not passed to startBotFlow, (2) execution_id shows 'unknown' in HTTP webhook logs because sessionId is not forwarded from executeIntegration to executeWebhookBlock, (3) add new workflow.version_typebot_history_id field from the TypebotHistory table.

Purpose: Make Datadog logs for published workflows queryable by real execution identifiers and version history IDs, completing the tracing story.
Output: All three fixes applied, tests updated, existing behavior preserved.
</objective>

<execution_context>
@/home/giordanowt/.claude/get-shit-done/workflows/execute-plan.md
@/home/giordanowt/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@packages/bot-engine/startSession.ts
@packages/bot-engine/executeGroup.ts
@packages/bot-engine/executeIntegration.ts
@packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
@packages/bot-engine/startBotFlow.ts
@packages/bot-engine/continueBotFlow.ts
@packages/schemas/features/chat/shared.ts
@packages/lib/executeGroup.instrumentation.test.ts
@packages/lib/http.instrumentation.test.ts
@packages/lib/schema.validation.test.ts
@packages/bot-engine/queries/findPublicTypebot.ts
@packages/bot-engine/queries/findTypebot.ts
@packages/prisma/postgresql/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix execution_id 'preview' and 'unknown', add version_typebot_history_id</name>
  <files>
    packages/bot-engine/queries/findLatestTypebotHistory.ts
    packages/schemas/features/chat/shared.ts
    packages/bot-engine/startSession.ts
    packages/bot-engine/executeIntegration.ts
    packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
    packages/bot-engine/executeGroup.ts
  </files>
  <action>
**1. Create `packages/bot-engine/queries/findLatestTypebotHistory.ts`:**

```typescript
import prisma from '@typebot.io/lib/prisma'

export const findLatestTypebotHistory = async ({
  typebotId,
}: {
  typebotId: string
}): Promise<string | undefined> => {
  const history = await prisma.typebotHistory.findFirst({
    where: { typebotId },
    orderBy: { publishedAt: 'desc' },
    select: { id: true },
  })
  return history?.id ?? undefined
}
```

**2. Update `packages/schemas/features/chat/shared.ts`:**

Add `typebotHistoryId` to the `sessionLoggingFieldsSchema`:

```typescript
const sessionLoggingFieldsSchema = z.object({
  name: z.string().optional(),
  workspaceId: z.string().optional(),
  workspaceName: z.string().optional(),
  typebotHistoryId: z.string().optional(),
})
```

This preserves backward compatibility via the `.and()` intersection.

**3. Fix `packages/bot-engine/startSession.ts`:**

3a. Add import for `findLatestTypebotHistory`:
```typescript
import { findLatestTypebotHistory } from './queries/findLatestTypebotHistory'
```

3b. In `startSession()`, after the `getTypebot()` call (line 82) and `getResult()` call (line 88-98), query the latest TypebotHistory. Add this after line 98 (the result block):

```typescript
const typebotHistoryId =
  startParams.type !== 'preview'
    ? await findLatestTypebotHistory({ typebotId: typebot.id })
    : undefined
```

3c. Update `convertStartTypebotToTypebotInSession` call (line 105-109) to pass `typebotHistoryId`:

```typescript
const typebotInSession = convertStartTypebotToTypebotInSession(
  typebot,
  startVariables,
  workspaceName,
  typebotHistoryId
)
```

3d. Update `convertStartTypebotToTypebotInSession` function signature (line 511-540) to accept and include `typebotHistoryId`:

```typescript
const convertStartTypebotToTypebotInSession = (
  typebot: StartTypebot,
  startVariables: Variable[],
  workspaceName?: string,
  typebotHistoryId?: string
): TypebotInSession =>
  typebot.version === '6'
    ? {
        version: typebot.version,
        id: typebot.id,
        name: typebot.name,
        workspaceId: typebot.workspaceId,
        workspaceName,
        typebotHistoryId,
        groups: typebot.groups,
        edges: typebot.edges,
        variables: startVariables,
        events: typebot.events,
        typebotId: typebot.id,
      }
    : {
        version: typebot.version,
        id: typebot.id,
        name: typebot.name,
        workspaceId: typebot.workspaceId,
        workspaceName,
        typebotHistoryId,
        groups: typebot.groups,
        edges: typebot.edges,
        variables: startVariables,
        events: typebot.events,
        typebotId: typebot.id,
      }
```

3e. **CRITICAL FIX** -- Pass `result?.id` as `sessionId` to `startBotFlow` at line 184:

```typescript
let chatReply = await startBotFlow({
  version,
  state: initialState,
  startFrom:
    startParams.type === 'preview' ? startParams.startFrom : undefined,
  startTime: Date.now(),
  textBubbleContentFormat: startParams.textBubbleContentFormat,
  sessionId: result?.id,  // Use resultId as execution identifier for published workflows
})
```

For live/published workflows, `result?.id` is always a valid CUID (created at line 418). For preview mode, `result` is undefined (line 395 returns early), so `sessionId` will be `undefined`, which correctly falls back to `'preview'` in executeGroup.

**4. Fix `packages/bot-engine/executeIntegration.ts`:**

Pass `sessionId` to `executeWebhookBlock` calls. Update lines 35 and 42:

```typescript
case IntegrationBlockType.ZAPIER:
case IntegrationBlockType.MAKE_COM:
case IntegrationBlockType.PABBLY_CONNECT:
  return {
    ...(await executeWebhookBlock(state, block, {
      disableRequestTimeout: true,
      sessionId,
    })),
    startTimeShouldBeUpdated: true,
  }
case IntegrationBlockType.WEBHOOK:
  return {
    ...(await executeWebhookBlock(state, block, {
      disableRequestTimeout: isNotDefined(env.CHAT_API_TIMEOUT),
      sessionId,
    })),
  }
```

**5. Fix `packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`:**

5a. Add `sessionId` to the `Params` type:
```typescript
type Params = { disableRequestTimeout?: boolean; timeout?: number; sessionId?: string }
```

5b. Add `version_typebot_history_id` to the `LogContext` type:
```typescript
type LogContext = {
  workspace: { id: string; name: string }
  workflow: { id: string; name: string; version_id: string; execution_id: string; version_typebot_history_id: string }
}
```

5c. In `executeWebhookBlock`, use `params.sessionId` and `typebotHistoryId` in logContext (around line 97-108):

```typescript
const logContext: LogContext = {
  workspace: {
    id: webhookTypebot.workspaceId ?? 'unknown',
    name: webhookWorkspaceName,
  },
  workflow: {
    id: webhookTypebot.id,
    name: webhookTypebot.name ?? 'unknown',
    version_id: String(webhookTypebot.version ?? 'unknown'),
    execution_id: params.sessionId ?? 'unknown',
    version_typebot_history_id: webhookTypebot.typebotHistoryId ?? 'unknown',
  },
}
```

**6. Update `packages/bot-engine/executeGroup.ts`:**

Add `version_typebot_history_id` to the logger.info call (around line 183-198):

```typescript
logger.info(`${workspaceName} - Block Executed`, {
  workspace: {
    id: typebot.workspaceId ?? 'unknown',
    name: workspaceName,
  },
  workflow: {
    id: typebot.id,
    name: typebot.name ?? 'unknown',
    version_id: String(typebot.version ?? 'unknown'),
    execution_id: sessionId ?? 'preview',
    version_typebot_history_id: typebot.typebotHistoryId ?? 'unknown',
  },
  typebot_block: {
    id: block.id,
    type: block.type,
  },
})
```
  </action>
  <verify>
    <automated>cd /home/giordanowt/Repositories/typebot.io && npx tsc --noEmit --project packages/bot-engine/tsconfig.json 2>&1 | head -30</automated>
    <manual>Verify TypeScript compiles without errors for bot-engine package</manual>
  </verify>
  <done>
    - startBotFlow receives result?.id as sessionId for published workflows
    - executeWebhookBlock receives and uses sessionId from executeIntegration
    - All logger calls include workflow.version_typebot_history_id
    - TypebotInSession schema includes optional typebotHistoryId
    - findLatestTypebotHistory query exists and is called in startSession
    - Preview mode still correctly falls back to 'preview' for execution_id
  </done>
</task>

<task type="auto">
  <name>Task 2: Update tests to validate new fields and fixed execution_id values</name>
  <files>
    packages/lib/executeGroup.instrumentation.test.ts
    packages/lib/http.instrumentation.test.ts
    packages/lib/schema.validation.test.ts
  </files>
  <action>
**1. Update `packages/lib/executeGroup.instrumentation.test.ts`:**

Add `version_typebot_history_id` to ALL test fixtures in the `workflow` object. Every logger call in the tests must include the new field:

Replace all `workflow: { id: '...', name: '...', version_id: '...', execution_id: '...' }` with `workflow: { id: '...', name: '...', version_id: '...', execution_id: '...', version_typebot_history_id: 'hist-1' }`.

Update the assertion in the "emits workflow.name and workflow.version_id" test to also verify `version_typebot_history_id`:

```typescript
expect(result.workflow).toEqual({
  id: 'wf-abc',
  name: 'My Flow',
  version_id: '2',
  execution_id: 'sess-xyz',
  version_typebot_history_id: 'hist-1',
})
```

Add a NEW test specifically for `version_typebot_history_id`:

```typescript
it('emits workflow.version_typebot_history_id (HIST-01)', () => {
  const result = runLoggerScript(
    `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1', version_typebot_history_id: 'clxyz123abc' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
  )
  expect((result.workflow as any).version_typebot_history_id).toBe('clxyz123abc')
})
```

**2. Update `packages/lib/http.instrumentation.test.ts`:**

Add `version_typebot_history_id` to ALL test fixtures in the `workflow` object. Replace all `execution_id: 'unknown'` with a real session ID value like `execution_id: 'sess-http-1'` AND add `version_typebot_history_id: 'hist-1'` to each fixture.

For example, the success path test becomes:
```typescript
`logger.info('TestWS - HTTP Request Executed', { workspace: { id: 'ws-1', name: 'TestWS' }, workflow: { id: 'wf-1', name: 'Flow', version_id: '2', execution_id: 'sess-http-1', version_typebot_history_id: 'hist-1' }, http: { url: 'https://example.com/api', method: 'POST', status_code: 200, duration: 142 } });`
```

Update all test assertions to reflect the new field presence.

**3. Update `packages/lib/schema.validation.test.ts`:**

3a. Update `DD_SCHEMA.workflowFields` to include the new field:
```typescript
workflowFields: { id: 'string', name: 'string', version_id: 'string', execution_id: 'string', version_typebot_history_id: 'string' },
```

3b. Update ALL logger call fixtures in the schema validation tests to include `version_typebot_history_id: 'hist-1'` in the workflow object.

3c. In the "Block Executed" schema test, add assertion:
```typescript
expect(typeof wf.version_typebot_history_id).toBe('string')
```

3d. In the "HTTP Request Executed" schema test, add assertion:
```typescript
expect(typeof wf.version_typebot_history_id).toBe('string')
```

3e. In the Performance Benchmark test, update the payload to include `version_typebot_history_id: 'hist-bench'`.
  </action>
  <verify>
    <automated>cd /home/giordanowt/Repositories/typebot.io && pnpm vitest run packages/lib/executeGroup.instrumentation.test.ts packages/lib/http.instrumentation.test.ts packages/lib/schema.validation.test.ts 2>&1 | tail -30</automated>
    <manual>All tests pass with the new version_typebot_history_id field present in assertions</manual>
  </verify>
  <done>
    - All executeGroup instrumentation tests include version_typebot_history_id in fixtures and assertions
    - All HTTP instrumentation tests use real execution_id values (not 'unknown') and include version_typebot_history_id
    - Schema validation tests verify version_typebot_history_id is string type
    - Performance benchmark includes the new field in its payload
    - All existing tests continue to pass
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation: `npx tsc --noEmit --project packages/bot-engine/tsconfig.json`
2. All instrumentation tests pass: `pnpm vitest run packages/lib/executeGroup.instrumentation.test.ts packages/lib/http.instrumentation.test.ts packages/lib/schema.validation.test.ts`
3. Manual grep verification:
   - `grep -n 'sessionId: result' packages/bot-engine/startSession.ts` shows the fix
   - `grep -n 'sessionId' packages/bot-engine/executeIntegration.ts` shows sessionId passed to webhook calls
   - `grep -n 'version_typebot_history_id' packages/bot-engine/executeGroup.ts` shows the new field
   - `grep -n 'version_typebot_history_id' packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts` shows the new field
</verification>

<success_criteria>
- Published workflow block logs show execution_id = resultId (CUID), not 'preview'
- HTTP webhook logs show execution_id = sessionId (CUID), not 'unknown'
- All logs include workflow.version_typebot_history_id from TypebotHistory table
- Preview mode execution_id correctly remains 'preview'
- Existing workflow.version_id field unchanged
- All 3 test files pass
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-execution-id-preview-unknown-for-pub/2-SUMMARY.md`
</output>
