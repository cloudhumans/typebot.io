# Testing Patterns

**Analysis Date:** 2026-02-26

## Test Framework

**Runner:**
- Vitest (unit/integration tests) - imported from vitest (`import { vi, describe, it, expect, beforeEach } from 'vitest'`)
- Playwright (E2E tests) - v1.43.1

**Config Files:**
- E2E: `apps/builder/playwright.config.ts`
- Unit: No explicit vitest config file found (uses Vitest defaults with environment inline)

**Run Commands:**
```bash
# E2E tests (Playwright)
pnpm test                    # Run E2E tests with Playwright
pnpm test:ui                 # Run E2E tests in UI mode with Playwright inspector
pnpm test:show-report        # Display HTML report from previous test run

# Unit tests (Vitest)
# Run from individual package directories as needed
```

## Test File Organization

**Location:**
- E2E tests: co-located with feature code in same directory
  - Pattern: `src/features/[feature]/[path]/[name].spec.ts`
  - Examples: `src/features/settings/settings.spec.ts`, `src/features/collaboration/collaboration.spec.ts`
- Unit/integration tests: mixed co-located and organized in test directories
  - Pattern: `src/features/[feature]/[path]/[name].test.ts`
  - Examples: `src/features/typebot/api/createTypebot.test.ts`, `src/features/workspace/helpers/accessControl.test.ts`
- E2E test setup: `src/test/global.setup.ts`
- Test utilities: `src/test/utils/` directory
- Test assets/fixtures: `src/test/assets/typebots/` directory

**Naming:**
- `.test.ts` for Vitest unit/integration tests
- `.spec.ts` for Playwright E2E tests
- Files follow feature naming: `featureName.test.ts`, `featureName.spec.ts`

**Structure:**
```
apps/builder/src/
├── features/
│   ├── typebot/api/
│   │   ├── createTypebot.ts
│   │   └── createTypebot.test.ts    # Unit test, co-located
│   ├── settings/
│   │   └── settings.spec.ts          # E2E test, co-located
│   └── workspace/helpers/
│       ├── accessControl.test.ts     # Unit test
│       ├── cognitoUtils.test.ts      # Unit test
│       └── getUserRoleInWorkspace.test.ts
└── test/
    ├── global.setup.ts               # Playwright setup
    ├── utils/
    │   ├── playwright.ts             # Test utilities
    │   ├── browser.ts
    │   ├── databaseActions.ts
    │   └── selectorUtils.ts
    └── assets/typebots/              # Test fixtures
```

## Test Structure

**Vitest Suite Organization:**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createTypebot } from './createTypebot'

describe('createTypebot', () => {
  // Setup fixtures
  const mockUser = { id: 'user-1', email: 'test@test.com' }
  const mockWorkspace = {
    id: 'ws-1',
    members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
    plan: Plan.FREE,
  }

  // Setup/teardown
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace)
  })

  // Test cases
  it('should throw if TOOL is missing tenant', async () => {
    const caller = createTypebot.createCaller({ user: mockUser })
    await expect(caller({...})).rejects.toThrow('Tenant and Tool description are mandatory')
  })
})
```

**Patterns:**
- Setup with fixtures at top of describe block (mockUser, mockWorkspace)
- `beforeEach()` clears mocks and resets default mock implementations
- Test names start with "should" or "should not"
- Async tests await promises and use async/await syntax
- Test scopes: group related tests in nested describe blocks if needed

**Playwright E2E Test Structure:**
```typescript
import { getTestAsset } from '@/test/utils/playwright'
import test, { expect } from '@playwright/test'
import { createId } from '@paralleldrive/cuid2'
import { importTypebotInDatabase } from '@typebot.io/playwright/databaseActions'

test.describe.parallel('Settings page', () => {
  test.describe('General', () => {
    test('should reflect change in real-time', async ({ page }) => {
      const typebotId = createId()
      await importTypebotInDatabase(getTestAsset('typebots/settings.json'), {
        id: typebotId,
      })
      await page.goto(`/typebots/${typebotId}/settings`)

      await page.click('text="Remember user"')
      await expect(page.getByPlaceholder('Type your answer...')).toHaveValue('Baptiste')
    })
  })
})
```

**Patterns:**
- Use `test.describe.parallel()` for top-level suites (enables parallel execution)
- Use `test.describe()` for nested suites
- Setup: create test data via `importTypebotInDatabase()`, navigate via `page.goto()`
- Actions: use Playwright locators (`page.click()`, `page.fill()`, `page.getByPlaceholder()`)
- Assertions: use Playwright expect with custom matchers (`toHaveValue()`, `toBeHidden()`)
- Test names describe behavior: "should reflect change in real-time"

## Mocking

**Framework:** Vitest's `vi` object for mocking and spying

**Patterns:**
```typescript
// Mock entire modules before imports
vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    workspace: {
      findUnique: vi.fn(),
    },
    typebot: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/features/workspace/helpers/getUserRoleInWorkspace', () => ({
  getUserRoleInWorkspace: vi.fn(),
}))

// Mock implementation setup in beforeEach
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace)
  vi.mocked(getUserRoleInWorkspace).mockReturnValue(WorkspaceRole.ADMIN)
})

// Verify mock was called
expect(vi.mocked(someFunction)).toHaveBeenCalled()
```

**What to Mock:**
- External dependencies: Prisma, database queries
- Third-party services: telemetry, auth, external APIs
- File system operations
- Environment-dependent functions
- Complex nested dependencies

**What NOT to Mock:**
- Pure utility functions (string/number manipulation, calculations)
- In-memory operations that don't have side effects
- Zod schemas (validate real behavior)
- Business logic functions you're testing
- Logger in some cases (mock only when testing log output)

**ESLint suppression for testing:**
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` used when mocking with `any` type
- Applied when test requires loose type checking for mock setup

## Fixtures and Factories

**Test Data:**
From `createTypebot.test.ts`:
```typescript
const mockUser = { id: 'user-1', email: 'test@test.com' }

const mockWorkspace = {
  id: 'ws-1',
  members: [{ userId: mockUser.id, role: WorkspaceRole.ADMIN }],
  plan: Plan.FREE,
}
```

**Location:**
- Fixtures defined inline in test files near top of describe block
- Shared fixtures: `src/test/utils/` (e.g., `getTestAsset()`, `importTypebotInDatabase()`)
- Test assets: `src/test/assets/typebots/` - JSON files representing bot configurations

**Factory Pattern:**
```typescript
const getTestAsset = (name: string) =>
  path.join(__dirname, '..', 'assets', name)

// Usage
await importTypebotInDatabase(getTestAsset('typebots/settings.json'), {
  id: typebotId,
})
```

## Coverage

**Requirements:** Not enforced (no coverage thresholds detected in configuration)

**View Coverage:**
- Not configured with public command
- Coverage would be generated by test runner if enabled

## Test Types

**Unit Tests:**
- Scope: Single function or small module
- Framework: Vitest
- Approach: Mock all external dependencies
- Location: Co-located with source code (`.test.ts`)
- Examples: `getUserRoleInWorkspace.test.ts`, `cognitoUtils.test.ts`

**Integration Tests:**
- Scope: Multiple functions working together, typically with database
- Framework: Vitest with database mocks
- Approach: Mock only external services, test real data flow
- Example: `createTypebot.test.ts` tests API with mocked Prisma

**E2E Tests:**
- Scope: Full user workflows through UI
- Framework: Playwright
- Approach: No mocking - full browser automation, real backend setup
- Location: Co-located with feature (`.spec.ts`)
- Examples: `settings.spec.ts`, `dashboard.spec.ts`
- Setup: Global setup via `global.setup.ts`, database initialization via `importTypebotInDatabase()`

## Playwright Configuration

**From `apps/builder/playwright.config.ts`:**

```typescript
export default defineConfig({
  timeout: process.env.CI ? 50 * 1000 : 40 * 1000,
  expect: {
    timeout: process.env.CI ? 10 * 1000 : 5 * 1000,
  },
  forbidOnly: !!process.env.CI,                    // Fail if .only is used in CI
  workers: process.env.CI ? 1 : 3,                 // Parallel workers
  retries: process.env.CI ? 2 : 0,                 // Retry failed tests in CI
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['html', { outputFolder: 'src/test/reporters' }],
  ],
  maxFailures: process.env.CI ? 10 : undefined,
  webServer: process.env.CI ? {                    // Start server in CI
    command: 'pnpm run start',
    timeout: 60_000,
    reuseExistingServer: true,
    port: 3000,
  } : undefined,
  outputDir: './src/test/results',
  use: {
    trace: 'on-first-retry',                       // Trace on failure
    locale: 'en-US',
    baseURL: process.env.NEXTAUTH_URL,
    storageState: './src/test/storageState.json',  // Persist auth state
  },
  projects: [
    {
      name: 'setup db',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } },
      dependencies: ['setup db'],
    },
  ],
})
```

**Key Features:**
- Different timeouts for CI vs local (longer in CI for flaky networks)
- 3 parallel workers locally, 1 in CI for stability
- 2 retries in CI, 0 locally (fail fast in development)
- HTML report generation to `src/test/reporters/`
- Trace on first retry for debugging failures
- Persistent auth state via `storageState.json`
- Database setup as dependency before browser tests

## Common Patterns

**Async Testing:**
```typescript
// Unit test with mocked async
it('should create normal typebot without tenant/toolDescription', async () => {
  vi.mocked(prisma.typebot.create).mockResolvedValue({
    id: 'tb-2',
    workspaceId: mockWorkspace.id,
    name: 'Standard Bot',
    settings: { general: { type: 'default' } },
    groups: [],
  })

  const caller = createTypebot.createCaller({ user: mockUser })

  await expect(
    caller({
      workspaceId: mockWorkspace.id,
      typebot: { name: 'Standard Bot' },
    })
  ).resolves.toBeDefined()
})

// E2E test with async navigation and interaction
test('should be fillable', async ({ page }) => {
  const typebotId = createId()
  await importTypebotInDatabase(getTestAsset('typebots/settings.json'), { id: typebotId })
  await page.goto(`/typebots/${typebotId}/settings`)

  await page.click('button:has-text("Typing")')
  await page.fill('[data-testid="speed"] input', '350')

  await expect(page.locator('[data-testid="speed"]')).toBeHidden()
})
```

**Error Testing:**
```typescript
it('should throw if TOOL is missing tenant', async () => {
  const caller = createTypebot.createCaller({ user: mockUser })

  await expect(
    caller({
      workspaceId: mockWorkspace.id,
      typebot: {
        name: 'My Bot',
        settings: { general: { type: 'TOOL' } },
        toolDescription: 'desc',
        // tenant missing
      },
    })
  ).rejects.toThrow('Tenant and Tool description are mandatory')
})
```

**Database Interaction Testing:**
```typescript
it('should allow access via Cognito claims when tenant_id matches workspace name', () => {
  const user = {
    id: 'user-123',
    email: 'test@example.com',
    cognitoClaims: {
      'custom:hub_role': 'CLIENT',
      'custom:tenant_id': 'shopee',
    },
  }

  const baseWorkspace = {
    members: [
      { userId: 'user-123', role: WorkspaceRole.MEMBER },
      { userId: 'user-456', role: WorkspaceRole.ADMIN },
    ],
    name: 'shopee',
  }

  const forbidden = isReadWorkspaceFobidden(baseWorkspace, user)
  expect(forbidden).toBe(false)
})
```

---

*Testing analysis: 2026-02-26*
