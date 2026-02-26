# Coding Conventions

**Analysis Date:** 2026-02-26

## Naming Patterns

**Files:**
- API route handlers: `camelCase.ts` (e.g., `getTypebot.ts`, `createTypebot.ts`, `updateTypebot.ts`)
- Test files: `camelCase.test.ts` or `camelCase.spec.ts` (e.g., `accessControl.test.ts`, `settings.spec.ts`)
- Helper functions: `camelCase.ts` (e.g., `isReadTypebotForbidden.ts`, `getUserRoleInWorkspace.ts`)
- Component files: `PascalCase.tsx` (React components)
- Directories: `kebab-case` for feature directories (e.g., `custom-domains/`, `workspace/helpers/`)

**Functions:**
- camelCase for function names
- Descriptive prefixes for access control: `isRead*`, `isWrite*`, `isAdmin*` for permission checks (e.g., `isReadTypebotForbidden`, `isWriteWorkspaceForbidden`)
- Verb-first naming for action functions: `create*`, `get*`, `update*`, `delete*`, `list*`, `publish*`, etc.
- Example from `getTypebot.ts`: `getCurrentUserMode()`, `migrateTypebot()`

**Variables:**
- camelCase for all variable names
- Meaningful names over abbreviations (e.g., `existingTypebot` not `bot`, `mockWorkspace` not `ws`)
- Prefix with `mock` for test fixtures: `mockUser`, `mockWorkspace`, `mockTypebot`
- Prefix with `is` or `has` for boolean variables: `isMemberOfWorkspace`, `hasAccess`, `forbidden`

**Types:**
- PascalCase for all type and interface names
- Suffix with `Props` for React component props: `ButtonProps`, `FormProps`
- Prefix with `Prisma` for Prisma model types: `PrismaMemberWithUser`
- Generic type parameters: Single uppercase letters (`T`, `K`, `V`) or descriptive names

## Code Style

**Formatting:**
- Prettier v2.8.8
- Tab width: 2 spaces
- Trailing comma: es5 (no trailing commas in function parameters)
- Semicolons: disabled (no semicolons at end of statements)
- Quotes: single quotes for strings

**Linting:**
- ESLint v8.44.0
- Extends: next, eslint:recommended, plugin:@typescript-eslint/recommended, prettier
- Parser: @typescript-eslint/parser
- Key rule: `@typescript-eslint/no-namespace` is disabled (allows namespace usage)
- Prettier integration for code formatting consistency

**Example formatting from codebase:**
```typescript
// Single quotes, no semicolons, trailing commas in es5 style
const mockUser = { id: 'user-1', email: 'test@test.com' }
const mockWorkspace = {
  id: 'ws-1',
  members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
  plan: Plan.FREE,
}
```

## Import Organization

**Order:**
1. Third-party packages and dependencies (react, next, @trpc, zod, etc.)
2. Workspace packages (marked with `@typebot.io/` prefix like `@typebot.io/schemas`, `@typebot.io/lib`, `@typebot.io/prisma`)
3. Local relative imports using path aliases
4. Local relative imports using relative paths (rare)

**Path Aliases:**
- `@/` resolves to `src/` (configured in `tsconfig.json`)
- `@typebot.io/` resolves to workspace packages in `/packages/`
- Used throughout: `@/features/`, `@/helpers/`, `@/test/`

**Example from `getTypebot.ts`:**
```typescript
import prisma from '@typebot.io/lib/prisma'
import { publicProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { typebotSchema } from '@typebot.io/schemas'
import { z } from 'zod'
import { isReadTypebotForbidden } from '@/features/typebot/helpers/isReadTypebotForbidden'
import { migrateTypebot } from '@typebot.io/migrations/migrateTypebot'
import { CollaborationType } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'
import { checkCognitoWorkspaceAccess } from '@/features/workspace/helpers/cognitoUtils'
```

## Error Handling

**Patterns:**
- Server errors thrown as `TRPCError` with specific error codes (NOT_FOUND, INTERNAL_SERVER_ERROR, FORBIDDEN, etc.)
- TRPCError includes: `code`, `message`, optional `cause` for wrapped errors
- Wrapped errors preserve context: original error passed to `cause` field
- Async operations wrapped in try-catch with meaningful error messages including context (IDs, user info)

**Example from `getTypebot.ts`:**
```typescript
throw new TRPCError({
  code: 'NOT_FOUND',
  message: `Typebot with ID: ${typebotId} not found or access forbidden. User: ${
    user?.id ?? 'unknown'
  }`,
})

// For parsing errors
try {
  const parsedTypebot = migrateToLatestVersion
    ? await migrateTypebot(typebotSchema.parse(existingTypebot))
    : typebotSchema.parse(existingTypebot)
} catch (err) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to parse typebot with ID: ${typebotId}`,
    cause: err,
  })
}
```

**Zod Validation:**
- Use Zod for runtime type validation on inputs
- Parse schemas early in handlers to catch type errors
- Include descriptive validation messages and documentation

## Logging

**Framework:** Winston (v3.17.0) on server, console redirection on client

**Configuration:** `packages/lib/logger.ts`
- Production uses structured JSON logging when `DD_LOGS_ENABLED=true` (Datadog integration)
- Development uses pretty-printed human-readable logs
- Log level: configurable via `LOG_LEVEL` env var, defaults to `debug` in dev, `info` in production

**Patterns:**
- Import logger: `import logger from '@/helpers/logger'`
- Use `.info()`, `.error()`, `.warn()`, `.debug()` methods
- Include context objects with relevant information (user ID, workspace name, etc.)

**Example from `getUserRoleInWorkspace.ts`:**
```typescript
logger.info('User authenticated via Cognito token', {
  workspace: workspaceName,
  role: cognitoAccess.role,
  userId,
})
```

## Comments

**When to Comment:**
- Explain WHY, not WHAT (code reads clearly in most cases)
- Document non-obvious logic or business rules
- Mark intentional limitations or edge cases
- Document function overloads and type signatures

**Patterns observed:**
- Single-line comments (`//`) for brief explanations
- Comments above code blocks explaining the next section
- Comments in test file headers for mock setup reasoning

**Example from `getUserRoleInWorkspace.ts`:**
```typescript
// Type for Prisma member objects with basic user info
type PrismaMemberWithUser = {
  userId: string
  role: WorkspaceRole
  workspaceId: string
  user: {
    name: string | null
    email: string | null
    image: string | null
  }
}

// Function overloads for different member types
export function getUserRoleInWorkspace(
  userId: string,
  workspaceMembers: WorkspaceMember[] | undefined,
  workspaceName?: string,
  user?: unknown
): WorkspaceRole | undefined
```

**JSDoc/TSDoc:**
- Not consistently used in current codebase
- Type annotations via TypeScript are preferred over JSDoc
- Complex overloads are documented inline

## Function Design

**Size:** Keep functions focused and under 50 lines when possible
- Longer functions in API handlers are acceptable when all logic is related
- Extract helper functions for repeated patterns

**Parameters:**
- Named parameters preferred over positional for clarity
- Use object destructuring in function signatures for multiple related parameters
- Type all parameters explicitly

**Return Values:**
- Always declare return types explicitly
- Return wrapped errors via TRPCError in API handlers
- Return tuples for functions with multiple distinct return values
- Async functions always return Promise-wrapped types

**Example from `getTypebot.ts`:**
```typescript
export const getTypebot = publicProcedure
  .input(
    z.object({
      typebotId: z.string().describe('...'),
      migrateToLatestVersion: z.boolean().optional().default(false),
    })
  )
  .output(
    z.object({
      typebot: typebotSchema,
      currentUserMode: z.enum(['guest', 'read', 'write']),
    })
  )
  .query(async ({ input: { typebotId, migrateToLatestVersion }, ctx: { user } }) => {
    // Implementation
    return {
      typebot: parsedTypebot,
      currentUserMode: getCurrentUserMode(user, existingTypebot),
    }
  })
```

## Module Design

**Exports:**
- Named exports preferred (easier to track usage with refactoring)
- Default exports reserved for configuration/singleton objects
- Export types separately from implementations

**Barrel Files:**
- Not heavily used in current structure
- Each feature has explicit import paths: `@/features/workspace/helpers/function`

**Module Organization:**
- Separation of concerns: API handlers, helpers, types
- Files grouped by feature: `features/typebot/api/`, `features/typebot/helpers/`, `features/workspace/helpers/`
- Shared utilities: `helpers/server/`, `helpers/logger`, path aliases `@/helpers/`

---

*Convention analysis: 2026-02-26*
