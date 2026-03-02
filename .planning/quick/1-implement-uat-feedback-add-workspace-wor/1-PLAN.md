---
phase: quick-uat-feedback
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
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
autonomous: true
requirements: [UAT-01, UAT-02, UAT-03, UAT-04]
must_haves:
  truths:
    - "Every 'Block Executed' log message is prefixed with workspace name: '${workspace_name} - Block Executed'"
    - "Every log includes workflow.name field"
    - "workflow.version field is renamed to workflow.version_id in all logs"
    - "Every log includes workspace.name and workspace.id fields"
    - "HTTP logs in executeWebhookBlock also include workspace and workflow context"
  artifacts:
    - path: "packages/schemas/features/chat/shared.ts"
      provides: "TypebotInSession schema with name, workspaceId, workspaceName"
      contains: "workspaceName"
    - path: "packages/bot-engine/executeGroup.ts"
      provides: "Block Executed log with workspace prefix and enriched fields"
      contains: "workspace_name"
    - path: "packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts"
      provides: "HTTP logs with workspace and workflow context"
      contains: "workspace"
  key_links:
    - from: "packages/bot-engine/queries/findPublicTypebot.ts"
      to: "packages/bot-engine/startSession.ts"
      via: "name, workspaceId, workspace.name now included in query select"
      pattern: "name: true"
    - from: "packages/bot-engine/startSession.ts"
      to: "packages/schemas/features/chat/shared.ts"
      via: "convertStartTypebotToTypebotInSession passes name, workspaceId, workspaceName"
      pattern: "workspaceName"
    - from: "packages/schemas/features/chat/shared.ts"
      to: "packages/bot-engine/executeGroup.ts"
      via: "TypebotInSession type includes new fields accessible at state.typebotsQueue[0].typebot"
      pattern: "typebot\\.workspaceName"
---

<objective>
Implement all 4 UAT feedback items for Datadog structured logging: add workspace context (name + id) to every log, add workflow.name, rename workflow.version to workflow.version_id, and prefix log messages with workspace_name.

Purpose: User tested in real Datadog and identified missing fields needed for filtering/searching logs by workspace and workflow name, plus a field rename for clarity.
Output: Updated schema, queries, logger calls, and tests matching the new DD log contract.
</objective>

<execution_context>
@/home/giordanowt/.claude/get-shit-done/workflows/execute-plan.md
@/home/giordanowt/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@packages/schemas/features/chat/shared.ts
@packages/schemas/features/chat/schema.ts
@packages/schemas/features/publicTypebot.ts
@packages/schemas/features/typebot/typebot.ts
@packages/bot-engine/queries/findPublicTypebot.ts
@packages/bot-engine/queries/findTypebot.ts
@packages/bot-engine/startSession.ts
@packages/bot-engine/executeGroup.ts
@packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
@packages/lib/executeGroup.instrumentation.test.ts
@packages/lib/http.instrumentation.test.ts
@packages/lib/schema.validation.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend TypebotInSession schema and plumb name/workspaceId/workspaceName through queries and session</name>
  <files>
    packages/schemas/features/chat/shared.ts
    packages/schemas/features/chat/schema.ts
    packages/bot-engine/queries/findPublicTypebot.ts
    packages/bot-engine/queries/findTypebot.ts
    packages/bot-engine/startSession.ts
  </files>
  <action>
    **Goal:** Make `name`, `workspaceId`, and `workspaceName` available on `TypebotInSession` so logger calls can access them from `state.typebotsQueue[0].typebot`.

    **1. Extend TypebotInSession schema (`packages/schemas/features/chat/shared.ts`):**

    The current `typebotInSessionStateSchema` uses `z.discriminatedUnion` with `.pick()` from publicTypebot schemas. Since publicTypebot does NOT have `name`, `workspaceId`, or `workspaceName`, we cannot just add them to the pick. Instead, wrap the existing discriminated union with `.and()` to merge additional optional fields:

    ```typescript
    const typebotInSessionBaseSchema = z.preprocess(
      preprocessTypebot,
      z.discriminatedUnion('version', [
        publicTypebotSchemaV5._def.schema.pick(typebotInSessionStatePick),
        publicTypebotSchemaV6.pick(typebotInSessionStatePick),
      ])
    )

    // Additional fields for logging context — optional for backward compatibility
    // with existing serialized sessions that lack these fields.
    const sessionLoggingFieldsSchema = z.object({
      name: z.string().optional(),
      workspaceId: z.string().optional(),
      workspaceName: z.string().optional(),
    })

    export const typebotInSessionStateSchema = typebotInSessionBaseSchema.and(sessionLoggingFieldsSchema)
    export type TypebotInSession = z.infer<typeof typebotInSessionStateSchema>
    ```

    All three fields are `.optional()` so existing serialized sessions (in Redis/DB) that lack these fields won't fail Zod validation.

    **2. Extend StartTypebot schema (`packages/schemas/features/chat/schema.ts`):**

    The `startTypebotPick` already picks from `typebotV5Schema` and `typebotV6Schema`, which HAVE `name` and `workspaceId`. Add them to the pick:

    ```typescript
    const startTypebotPick = {
      version: true,
      id: true,
      name: true,           // <-- ADD
      workspaceId: true,     // <-- ADD
      groups: true,
      events: true,
      edges: true,
      variables: true,
      settings: true,
      theme: true,
    } as const
    ```

    This makes `name` and `workspaceId` available on the `StartTypebot` type.

    **3. Update `findPublicTypebot` query (`packages/bot-engine/queries/findPublicTypebot.ts`):**

    Add `name: true` and `workspaceId: true` to the `typebot` select, and add `name: true` to the `workspace` select:

    ```typescript
    typebot: {
      select: {
        isArchived: true,
        isClosed: true,
        name: true,           // <-- ADD (typebot name)
        workspaceId: true,    // <-- ADD
        workspace: {
          select: {
            id: true,
            name: true,        // <-- ADD (workspace name)
            plan: true,
            customChatsLimit: true,
            isQuarantined: true,
            isSuspended: true,
          },
        },
      },
    },
    ```

    **4. Update `findTypebot` query (`packages/bot-engine/queries/findTypebot.ts`):**

    Add `name: true` and `workspaceId: true` to the select, and add a `workspace` relation to get `workspace.name`:

    ```typescript
    select: {
      version: true,
      id: true,
      name: true,            // <-- ADD
      workspaceId: true,     // <-- ADD
      groups: true,
      events: true,
      edges: true,
      settings: true,
      theme: true,
      variables: true,
      isArchived: true,
      workspace: {           // <-- ADD entire block
        select: {
          name: true,
        },
      },
    },
    ```

    **5. Update `getTypebot` and `convertStartTypebotToTypebotInSession` in `startSession.ts`:**

    In `getTypebot()`, the `parsedTypebot` construction for public typebots uses `omit(typebotQuery.typebot, 'workspace')` -- this will now include `name` and `workspaceId` from the typebot relation. We need to also inject `workspaceName`.

    After line 370 (`return startTypebotSchema.parse(parsedTypebot)`), the schema parse will preserve `name` and `workspaceId` since we added them to the pick. But `workspaceName` is NOT on the typebot schema, so we need to pass it separately.

    **Modify `getTypebot` to return workspace name alongside the StartTypebot:**

    Change the return type of `getTypebot` from `Promise<StartTypebot>` to `Promise<StartTypebot & { workspaceName?: string }>`.

    For the `findPublicTypebot` path:
    ```typescript
    const workspaceName = typebotQuery && 'typebot' in typebotQuery
      ? typebotQuery.typebot.workspace.name
      : undefined
    ```

    For the `findTypebot` path (preview):
    ```typescript
    // typebotQuery here is the typebot itself with workspace joined
    const workspaceName = typebotQuery && 'workspace' in typebotQuery
      ? (typebotQuery as any).workspace?.name
      : undefined
    ```

    Return: `{ ...startTypebotSchema.parse(parsedTypebot), workspaceName }`

    **Update `startSession` to pass workspaceName:**

    In `startSession()`, change:
    ```typescript
    const typebot = await getTypebot(startParams)
    ```
    to destructure `workspaceName`:
    ```typescript
    const { workspaceName, ...typebot } = await getTypebot(startParams)
    ```

    Then update `convertStartTypebotToTypebotInSession` to accept and pass `workspaceName`:
    ```typescript
    const convertStartTypebotToTypebotInSession = (
      typebot: StartTypebot,
      startVariables: Variable[],
      workspaceName?: string
    ): TypebotInSession =>
      typebot.version === '6'
        ? {
            version: typebot.version,
            id: typebot.id,
            name: typebot.name,               // <-- ADD
            workspaceId: typebot.workspaceId,  // <-- ADD
            workspaceName,                     // <-- ADD
            groups: typebot.groups,
            edges: typebot.edges,
            variables: startVariables,
            events: typebot.events,
            typebotId: typebot.id,
          }
        : {
            version: typebot.version,
            id: typebot.id,
            name: typebot.name,               // <-- ADD
            workspaceId: typebot.workspaceId,  // <-- ADD
            workspaceName,                     // <-- ADD
            groups: typebot.groups,
            edges: typebot.edges,
            variables: startVariables,
            events: typebot.events,
            typebotId: typebot.id,
          }
    ```

    Update the call site in `startSession()`:
    ```typescript
    const typebotInSession = convertStartTypebotToTypebotInSession(
      typebot,
      startVariables,
      workspaceName
    )
    ```

    **Important notes:**
    - The `getTypebot` function for preview mode with `startParams.typebot` (line 319-320) returns early without any query -- in this case `workspaceName` and possibly `name`/`workspaceId` may be undefined. This is acceptable since these are optional fields and preview mode may not have workspace context.
    - The `.and()` approach on the Zod schema means the type is an intersection, which TypeScript handles well.
  </action>
  <verify>
    <automated>cd /home/giordanowt/Repositories/typebot.io && npx tsc --noEmit --project packages/schemas/tsconfig.json 2>&1 | head -30 && npx tsc --noEmit --project packages/bot-engine/tsconfig.json 2>&1 | head -30</automated>
    <manual>Verify TypebotInSession type now includes name?, workspaceId?, workspaceName? fields</manual>
  </verify>
  <done>
    TypebotInSession schema includes optional name, workspaceId, and workspaceName fields. Both findPublicTypebot and findTypebot queries fetch these from the database. convertStartTypebotToTypebotInSession passes them into the session state. Existing serialized sessions without these fields still parse successfully (backward compatible).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update all logger calls with workspace context, workflow.name, version_id rename, message prefix, and update tests</name>
  <files>
    packages/bot-engine/executeGroup.ts
    packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts
    packages/lib/executeGroup.instrumentation.test.ts
    packages/lib/http.instrumentation.test.ts
    packages/lib/schema.validation.test.ts
  </files>
  <action>
    **Goal:** Update all logger.info/warn/error calls to include workspace context, workflow.name, renamed version_id, and prefixed message. Update all tests to match.

    **1. Update `executeGroup.ts` — the "Block Executed" log (line 180-190):**

    Extract typebot reference for readability, then update the log call:

    ```typescript
    const typebot = newSessionState.typebotsQueue[0].typebot
    const workspaceName = typebot.workspaceName ?? 'unknown'

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
      },
      typebot_block: {
        id: block.id,
        type: block.type,
      },
    })
    ```

    Key changes:
    - Message: `"Block Executed"` -> `"${workspaceName} - Block Executed"`
    - Added: `workspace.id`, `workspace.name` (new fields)
    - Added: `workflow.name` (new field)
    - Renamed: `workflow.version` -> `workflow.version_id`
    - Removed: `workflow.version` (old field name)

    **2. Update `executeWebhookBlock.ts` — all 4 HTTP logger calls:**

    The `executeWebhook` function does NOT have access to `state` (it only receives a `ParsedWebhook`). The 4 HTTP logs are in `executeWebhook()` at lines 248, 287, 316, 330.

    To add workspace/workflow context to HTTP logs, we need to pass the context into `executeWebhook`. Add a new parameter:

    ```typescript
    type LogContext = {
      workspace: { id: string; name: string }
      workflow: { id: string; name: string; version_id: string; execution_id: string }
    }
    ```

    Update `executeWebhook` signature:
    ```typescript
    export const executeWebhook = async (
      webhook: ParsedWebhook,
      params: Params = {},
      logContext?: LogContext
    )
    ```

    Update `executeWebhookBlock` to construct and pass `logContext`:
    ```typescript
    const typebot = state.typebotsQueue[0].typebot
    const workspaceName = typebot.workspaceName ?? 'unknown'
    const logContext: LogContext = {
      workspace: {
        id: typebot.workspaceId ?? 'unknown',
        name: workspaceName,
      },
      workflow: {
        id: typebot.id,
        name: typebot.name ?? 'unknown',
        version_id: String(typebot.version ?? 'unknown'),
        execution_id: 'unknown', // sessionId not available here
      },
    }
    ```

    Note: `executeWebhookBlock` does NOT receive `sessionId`. The `execution_id` will be `'unknown'` for HTTP logs. This is acceptable — the HTTP logs primarily serve for HTTP-level monitoring. If `sessionId` is needed later, it would require threading it through `executeIntegration`.

    Update all 4 HTTP logger calls to include context and prefixed message:

    **Success (line 248):**
    ```typescript
    logger.info(`${logContext?.workspace.name ?? 'unknown'} - HTTP Request Executed`, {
      ...logContext,
      http: {
        url: request.url,
        method: request.method,
        status_code: response.status,
        duration: httpDuration,
      },
    })
    ```

    **Error (line 287):**
    ```typescript
    logger.warn(`${logContext?.workspace.name ?? 'unknown'} - HTTP Request Error`, {
      ...logContext,
      http: {
        url: request.url,
        method: request.method,
        status_code: error.response.status,
        duration: Date.now() - requestStartTime,
      },
    })
    ```

    **Timeout (line 316):**
    ```typescript
    logger.error(`${logContext?.workspace.name ?? 'unknown'} - HTTP Request Timeout`, {
      ...logContext,
      http: {
        url: request.url,
        method: request.method,
        timeout_ms: request.timeout || 0,
        duration: Date.now() - requestStartTime,
      },
    })
    ```

    **Generic failure (line 330):**
    ```typescript
    logger.error(`${logContext?.workspace.name ?? 'unknown'} - HTTP Request Failed`, {
      ...logContext,
      http: {
        url: request.url,
        method: request.method,
        duration: Date.now() - requestStartTime,
      },
      error: error instanceof Error ? error.message : String(error),
    })
    ```

    **3. Update `executeGroup.instrumentation.test.ts`:**

    Update all test fixtures to use the new log schema:
    - Message checks: `'Block Executed'` -> match pattern `/ - Block Executed$/`
    - `workflow` object: add `name` field, rename `version` to `version_id`
    - Add `workspace` object expectations

    Example updated test:
    ```typescript
    it('emits message prefixed with workspace name (UAT-01)', () => {
      const result = runLoggerScript(
        `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-1', name: 'My Flow', version_id: '2', execution_id: 'sess-1' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
      )
      expect(result.message).toMatch(/ - Block Executed$/)
      expect(result.message).toContain('TestWorkspace')
    })

    it('emits workspace.id and workspace.name (UAT-04)', () => {
      const result = runLoggerScript(
        `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-abc', name: 'My Flow', version_id: '2', execution_id: 'sess-xyz' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
      )
      expect(result.workspace).toEqual({ id: 'ws-1', name: 'TestWorkspace' })
    })

    it('emits workflow.name and workflow.version_id (UAT-02, UAT-03)', () => {
      const result = runLoggerScript(
        `logger.info('TestWorkspace - Block Executed', { workspace: { id: 'ws-1', name: 'TestWorkspace' }, workflow: { id: 'wf-abc', name: 'My Flow', version_id: '2', execution_id: 'sess-xyz' }, typebot_block: { id: 'b-1', type: 'webhook' } });`
      )
      expect(result.workflow).toEqual({
        id: 'wf-abc',
        name: 'My Flow',
        version_id: '2',
        execution_id: 'sess-xyz',
      })
    })
    ```

    Remove the old `workflow.version is emitted as string, not number` test (replaced by version_id test). Keep the `typebot_block` and `ddsource`/`service` tests but update their logger call fixtures to match the new schema.

    **4. Update `http.instrumentation.test.ts`:**

    Update all HTTP test fixtures to include workspace and workflow context in the logger calls, and update message expectations:

    ```typescript
    it('success path emits workspace, workflow, and http context (HTTP-01, UAT-04)', () => {
      const result = runLoggerScript(
        `logger.info('TestWS - HTTP Request Executed', { workspace: { id: 'ws-1', name: 'TestWS' }, workflow: { id: 'wf-1', name: 'Flow', version_id: '2', execution_id: 'unknown' }, http: { url: 'https://example.com/api', method: 'POST', status_code: 200, duration: 142 } });`
      )
      expect(result.message).toMatch(/ - HTTP Request Executed$/)
      expect(result.workspace).toEqual({ id: 'ws-1', name: 'TestWS' })
      expect(result.workflow).toBeDefined()
      expect(result.http).toEqual({
        url: 'https://example.com/api',
        method: 'POST',
        status_code: 200,
        duration: 142,
      })
    })
    ```

    Apply same pattern for error, timeout, and failure tests.

    **5. Update `schema.validation.test.ts`:**

    Update the `DD_SCHEMA` fixture:
    ```typescript
    const DD_SCHEMA = {
      topLevel: ['message', 'level', 'timestamp', 'ddsource', 'service'],
      ddsource: 'nodejs',
      service: 'typebot-runner',
      workspaceFields: { id: 'string', name: 'string' },  // NEW
      workflowFields: { id: 'string', name: 'string', version_id: 'string', execution_id: 'string' },  // UPDATED: version -> version_id, added name
      typebotBlockFields: { id: 'string', type: 'string' },
      httpSuccessFields: { url: 'string', method: 'string', status_code: 'number', duration: 'number' },
      httpTimeoutFields: { url: 'string', method: 'string', timeout_ms: 'number', duration: 'number' },
    }
    ```

    Update the `"Block Executed" log matches DD pipeline schema` test to:
    - Use new message format with workspace prefix
    - Assert `workspace` nested object with `id` and `name`
    - Assert `workflow` includes `name` and `version_id` (not `version`)
    - Assert `workflow` no longer has `version` field

    Update all HTTP schema tests similarly to include workspace/workflow context.

    In the Performance Benchmark test, update the payload to match new schema:
    ```typescript
    const payload = { workspace: { id: 'ws-bench', name: 'Bench' }, workflow: { id: 'wf-bench', name: 'Flow', version_id: '2', execution_id: 'sess-bench' }, typebot_block: { id: 'b-bench', type: 'webhook' } };
    ```
    And update the logger message: `'Bench - Block Executed'`
  </action>
  <verify>
    <automated>cd /home/giordanowt/Repositories/typebot.io && npx vitest run packages/lib/executeGroup.instrumentation.test.ts packages/lib/http.instrumentation.test.ts packages/lib/schema.validation.test.ts --reporter=verbose 2>&1 | tail -40</automated>
    <manual>Check that all tests pass with new schema: workspace prefix in message, workspace.name, workspace.id, workflow.name, workflow.version_id (not version)</manual>
  </verify>
  <done>
    All logger calls in executeGroup.ts and executeWebhookBlock.ts emit: (1) message prefixed with workspace_name, (2) workspace.name and workspace.id, (3) workflow.name, (4) workflow.version_id (renamed from workflow.version). All 3 test files pass with updated schema fixtures.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors for both packages/schemas and packages/bot-engine
2. All 3 instrumentation test files pass: executeGroup, http, schema.validation
3. Verify that TypebotInSession type includes optional name, workspaceId, workspaceName
4. Verify no existing test regressions: `npx vitest run packages/lib/ --reporter=verbose`
</verification>

<success_criteria>
- Every "Block Executed" log message starts with "${workspace_name} - "
- Every "HTTP Request *" log message starts with "${workspace_name} - "
- All logs contain workspace.id and workspace.name fields
- All logs contain workflow.name field
- workflow.version field is renamed to workflow.version_id everywhere (code + tests)
- TypebotInSession backward-compatible (optional fields, existing sessions don't break)
- All 3 test files pass with green
</success_criteria>

<output>
After completion, create `.planning/quick/1-implement-uat-feedback-add-workspace-wor/1-SUMMARY.md`
</output>
