# Codebase Concerns

**Analysis Date:** 2026-02-26

## Tech Debt

**Deprecated API Endpoints (Next.js Pages Router):**
- Issue: Multiple legacy REST API endpoints in `pages/api/` have been migrated to tRPC but legacy handlers remain in codebase
- Files:
  - `apps/builder/src/pages/api/folders/[id].ts`
  - `apps/builder/src/pages/api/folders.ts`
  - `apps/builder/src/pages/api/typebots/[typebotId]/analytics/stats.ts`
  - `apps/builder/src/pages/api/integrations/google-sheets/spreadsheets.ts`
- Impact: Code duplication, maintenance burden, potential API versioning inconsistencies
- Fix approach: Remove deprecated handlers and ensure all clients use tRPC endpoints exclusively

**Deprecated File Upload Codepath:**
- Issue: Legacy file upload path via `typebotId`/`blockId`/`resultId` maintained for backward compatibility with code paths and comments indicating removal
- Files: `apps/viewer/src/features/fileUpload/api/generateUploadUrl.ts` (lines 54-108)
- Impact: Unnecessary complexity, duplicated S3 interaction logic, confusing API surface
- Fix approach: Identify and migrate remaining clients to session-based approach, then remove legacy branch

**Deprecated Package Directories:**
- Issue: Entire deprecated package directories exist in codebase (`packages/deprecated/bot-engine`, `packages/deprecated/typebot-js`) with unclear status
- Files: `/packages/deprecated/`
- Impact: Confusion about what is actively used vs. legacy, build dependency resolution issues
- Fix approach: Audit usage, migrate remaining references, archive or remove entirely

**Deprecated S3 Helpers:**
- Issue: `packages/lib/s3/deprecated/` directory exists but unclear what functions are deprecated and what newer alternatives should be used
- Files: `packages/lib/s3/deprecated/`
- Impact: Developers may use deprecated functions unknowingly
- Fix approach: Document migration path clearly, or consolidate S3 utilities

## Type Safety Issues

**Excessive Use of `z.any()` in Zod Schemas:**
- Issue: Multiple schema definitions use `z.any()` for flexible fields without clear validation or runtime type safety
- Files:
  - `apps/builder/src/features/typebot/api/getTypebotHistory.ts` (lines 54-59: groups, events, variables, edges, theme, settings)
  - `apps/viewer/src/features/fileUpload/api/generateUploadUrl.ts` (line 42: formData)
  - `packages/schemas/features/blocks/bubbles/text/schema.ts`
  - `packages/schemas/features/chat/schema.ts`
- Impact: Loss of type safety at API boundaries, difficult to enforce API contracts, harder to detect breaking changes
- Fix approach: Replace `z.any()` with more specific schemas; use `z.record()` with typed values where appropriate

**Unsafe JSON Parsing Without Error Handling:**
- Issue: Multiple API endpoints use `JSON.parse()` without try-catch for user-supplied data
- Files:
  - `apps/builder/src/pages/api/credentials/google-sheets/callback.ts` (line 18-19): Base64-decoded state string
  - `apps/builder/src/pages/api/folders/[id].ts` (line 30)
  - `apps/builder/src/pages/api/folders.ts` (line 48)
- Impact: Malformed input could crash handlers; unvalidated state can be exploited
- Fix approach: Wrap JSON.parse in try-catch; validate structure before use

**Widespread `@ts-ignore` and `@ts-expect-error` Comments:**
- Issue: 20+ instances of type suppression pragmas throughout codebase without clear justification
- Files:
  - `apps/builder/src/features/editor/providers/TypebotProvider.tsx`
  - `apps/builder/src/features/graph/providers/GraphProvider.tsx`
  - `packages/bot-engine/executeGroup.ts` (multiple instances)
  - `packages/lib/markdown/remark-slate/remarkPlugin.ts`
- Impact: Hides real type errors, makes refactoring dangerous, increases technical debt
- Fix approach: Investigate each suppression; use proper type narrowing or fix underlying type issues

**Variables Loosely Typed:**
- Issue: Variable execution uses `any` for values and arguments
- Files: `packages/variables/executeFunction.ts` (line 39: `Record<string, any>`, line 41: function parameter)
- Impact: No validation of variable types at runtime; impossible to catch type mismatches
- Fix approach: Introduce proper TypeScript interfaces for variable values

## Security Concerns

**Unsafe innerHTML Assignment in Embed Generation:**
- Issue: Generated embed code directly assigns to `innerHTML` with user-controlled script content
- Files: `apps/builder/src/features/publish/components/embeds/snippetParsers/shared.ts` (line 53)
- Pattern: `typebotInitScript.innerHTML = \`${script}\``
- Current mitigation: Script is generated server-side from tRPC mutations (some validation exists)
- Risk: If user input to embed generation is not properly sanitized, could enable XSS in generated snippets
- Recommendations:
  - Audit all inputs to `parseInlineScript()` function
  - Use `textContent` instead of `innerHTML` where possible
  - Validate embed configuration before script generation

**Unsafe OAuth State Deserialization:**
- Issue: OAuth callback state parameter deserialized without validation
- Files: `apps/builder/src/pages/api/credentials/google-sheets/callback.ts` (lines 18-20)
- Pattern: `JSON.parse(Buffer.from(state, 'base64').toString())` - no schema validation
- Risk: Attacker could craft malformed state, causing crashes; CSRF vulnerability if state not validated against session
- Recommendations:
  - Add Zod validation schema for state structure
  - Implement CSRF token validation (verify state matches server-stored value)
  - Add error boundaries for invalid state

**Isolated-VM Code Execution with Limited Validation:**
- Issue: User-supplied function bodies executed in isolated-vm with limited security model
- Files: `packages/variables/executeFunction.ts` (lines 45-88)
- Current mitigation: Uses isolated-vm instead of `Function()` constructor (security improvement in changelog)
- Risk: Even with isolation, complex expressions could consume excessive resources; custom fetch/jwtSign available to user code
- Recommendations:
  - Implement timeout and memory limits (timeout exists at 10s)
  - Whitelist allowed global functions (currently provides fetch, jwtSign)
  - Log suspicious code execution patterns
  - Consider rate limiting per-user code execution

**Credentials Storage Without Clear Encryption Verification:**
- Issue: Credentials stored encrypted in database but encryption function calls not consistently validated
- Files:
  - `apps/builder/src/pages/api/credentials/google-sheets/callback.ts` (line 48: `encrypt()` call)
  - Multiple credential handlers use encryption but no verification of successful decryption
- Impact: If encryption/decryption fails silently, credentials could leak as plaintext or cause auth failures
- Fix approach: Add explicit error handling for encryption/decryption; validate encrypted data structure

## Error Handling Gaps

**Silent Error Swallowing in API Handlers:**
- Issue: Many API handlers catch errors but return generic error responses without logging details
- Files:
  - `packages/bot-engine/apiHandlers/getMessageStream.ts` (lines 152-164): OpenAI errors logged but generic "Could not create stream" returned
  - `packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`: Webhook errors caught but details lost
- Impact: Difficult to debug production issues; attackers don't know what failed
- Fix approach: Log full errors server-side; return appropriate HTTP status codes and safe error messages to clients

**Incomplete Error Type Guards:**
- Issue: Some error handling uses `instanceof Error` which may not catch all error types in promise rejections
- Files: `packages/bot-engine/apiHandlers/startChat.ts`, `packages/bot-engine/logs/helpers/formatLogDetails.ts`
- Impact: Some error details may be lost if errors are not Error instances
- Fix approach: Use discriminated unions for error handling; ensure all rejection paths return Error objects

**Missing Null/Undefined Checks Before Database Operations:**
- Issue: Many database queries assume successful previous lookups without explicit null checks
- Files: `packages/bot-engine/apiHandlers/getMessageStream.ts` (line 39-47: assumes block and group exist)
- Impact: Potential null dereference errors not caught by type checker
- Fix approach: Use type guards or Result types to enforce null checking

## Performance Concerns

**Large Files with Complex Logic:**
- Files with high complexity that may benefit from splitting:
  - `packages/bot-engine/continueBotFlow.ts` (685 lines)
  - `packages/bot-engine/startSession.ts` (579 lines)
  - `packages/bot-engine/executeGroup.ts` (468 lines)
  - `apps/builder/src/features/typebot/api/typebotValidation.ts` (827 lines)
  - `apps/builder/src/features/typebot/api/getPublishedTypebot.ts` (429 lines)
- Impact: Harder to test, understand, and maintain; increased cognitive load
- Fix approach: Break into smaller, single-responsibility functions with clear interfaces

**Database Query Inefficiency Risks:**
- Issue: Large history queries use `findMany()` without explicit pagination/filtering optimization indicators
- Files: `apps/builder/src/features/typebot/api/getTypebotHistory.ts`
- Impact: Could load many large history records with nested content if not careful
- Fix approach: Ensure `excludeContent` parameter actually eliminates large fields at database level

**N+1 Query Potential in Block Validation:**
- Issue: Complex validation loops may iterate blocks/groups multiple times without caching
- Files: `apps/builder/src/features/typebot/api/typebotValidation.ts` (complex validation logic)
- Impact: Could cause O(n²) behavior for large typebots with many blocks
- Fix approach: Cache block lookups, use single-pass algorithms where possible

## Fragile Areas

**Complex Block Type Discrimination:**
- Issue: Extensive use of type guards and conditional checks for different block types scattered throughout codebase
- Files: `packages/bot-engine/continueBotFlow.ts`, `apps/builder/src/features/typebot/api/typebotValidation.ts`
- Risk: Adding new block types requires changes in multiple files; easy to miss cases
- Safe modification: Use discriminated unions consistently; create helper functions for common type checks
- Test coverage: Check that all block types are handled in validation and execution paths

**Form/State Management in Builder:**
- Issue: Provider pattern with @ts-ignore suppressions indicates complex state management
- Files:
  - `apps/builder/src/features/editor/providers/TypebotProvider.tsx`
  - `apps/builder/src/features/graph/providers/GraphProvider.tsx`
  - `apps/builder/src/features/folders/TypebotDndProvider.tsx`
- Risk: State mutations may not be properly typed; React context usage unclear
- Safe modification: Add explicit action types, avoid direct mutations
- Test coverage: Test provider state transitions carefully

**WhatsApp Message Conversion Logic:**
- Issue: Complex message type conversions with array grouping operations
- Files: `packages/bot-engine/whatsapp/convertInputToWhatsAppMessage.ts`
- Risk: Message format incompatibility could cause delivery failures
- Safe modification: Add comprehensive test cases for each message type
- Test coverage: Include real WhatsApp message examples

## Test Coverage Gaps

**No Tests for Legacy Endpoint Handlers:**
- What's not tested: Deprecated API endpoints that should be removed
- Files:
  - `apps/builder/src/pages/api/folders/[id].ts`
  - `apps/builder/src/pages/api/folders.ts`
- Risk: Could break during removal if undocumented clients depend on them
- Priority: **Medium** - Lower priority since scheduled for removal

**Insufficient Error Path Testing:**
- What's not tested: Error scenarios in file upload, OAuth, and credential handling
- Files:
  - `apps/viewer/src/features/fileUpload/api/generateUploadUrl.ts`
  - `apps/builder/src/pages/api/credentials/google-sheets/callback.ts`
- Risk: Production errors from malformed input or missing resources could cause poor user experience
- Priority: **High** - These are user-facing failures that should degrade gracefully

**Limited Security Test Coverage:**
- What's not tested:
  - Code execution in `executeFunction()` with malicious payloads
  - OAuth state validation robustness
  - Type validation for loosely-typed schema fields
- Files: `packages/variables/executeFunction.ts`, OAuth handlers
- Risk: Security bypasses not detected before production
- Priority: **High** - Security-critical code needs comprehensive adversarial testing

**Missing Integration Tests for Block Execution:**
- What's not tested: Full flow of different block types in sequence
- Files: `packages/bot-engine/`
- Risk: Block ordering and state transitions may have subtle bugs
- Priority: **Medium** - Important for reliability but caught by e2e tests

## Scaling Limits

**Session State Size:**
- Current capacity: Session state stored in database with nested typebot definitions
- Limit: Large typebots with many variables/groups could create massive session records
- Scaling path: Implement state compression, reference resolution, or sharding by workspace

**File Upload Concurrency:**
- Current implementation: S3 uploads happen via presigned URLs but no explicit rate limiting
- Limit: Multiple concurrent uploads from same user could exhaust connection pools
- Scaling path: Add queue-based upload management, implement per-user/workspace rate limits

**Webhook Execution Timeouts:**
- Current capacity: 10-second default timeout appears insufficient for complex integrations
- Limit: Long-running webhooks could timeout; no circuit breaker for failing endpoints
- Scaling path: Make timeout configurable per-block; implement exponential backoff

## Dependencies at Risk

**Isolated-VM for Code Execution:**
- Risk: Relatively niche package; limited community compared to alternatives
- Impact: Security vulnerabilities in isolated-vm could affect all user code execution
- Migration plan: If needed, evaluate deno, workerd, or server-less sandbox services

**Prisma ORM:**
- Risk: Major version upgrades have breaking changes; migration path can be complex
- Impact: Schema changes, adapter compatibility issues
- Current usage: Extensive; would require significant refactoring
- Migration plan: Monitor Prisma releases; establish upgrade process; consider query optimization

## Known Issues

**Inconsistent Error Response Formats:**
- What's happening: Some endpoints return `{ message: string }`, others `{ error: string }`, some throw TRPCError
- Files: Legacy API handlers mixed with tRPC endpoints
- Workaround: tRPC endpoints provide consistent error format; legacy endpoints inconsistent
- Migration: Prioritize tRPC migration for consistency

---

*Concerns audit: 2026-02-26*
