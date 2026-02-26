# Codebase Structure

**Analysis Date:** 2026-02-26

## Directory Layout

```
typebot.io/
├── apps/                           # Main applications
│   ├── builder/                    # Typebot visual editor and IDE
│   │   ├── src/
│   │   │   ├── pages/              # Next.js pages and API routes
│   │   │   ├── features/           # Feature-based modules (auth, editor, workspace, etc.)
│   │   │   ├── components/         # Shared React components
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── helpers/            # Utility functions
│   │   │   ├── lib/                # Client libraries and config
│   │   │   ├── assets/             # Static styles and images
│   │   │   └── i18n/               # Internationalization files
│   │   └── package.json
│   ├── viewer/                     # Published typebot display and chat interface
│   │   ├── src/
│   │   │   ├── pages/              # Chat pages and API routes
│   │   │   ├── features/           # Chat-specific features (answers, results, whatsapp)
│   │   │   ├── components/         # Chat UI components
│   │   │   ├── lib/                # Utilities
│   │   │   ├── assets/             # Styles
│   │   │   └── helpers/
│   │   └── package.json
│   └── docs/                       # Documentation site
├── packages/                       # Shared libraries and utilities
│   ├── bot-engine/                 # Core session execution engine
│   ├── lib/                        # Shared utilities, API helpers, validators
│   ├── schemas/                    # Zod schemas and TypeScript types
│   ├── prisma/                     # Database models and migrations
│   ├── variables/                  # Variable parsing and substitution
│   ├── results/                    # Result/answer processing utilities
│   ├── logic/                      # Logic block evaluation
│   ├── forge/                      # Plugin/integration system
│   │   ├── repository/             # Block type registry
│   │   └── blocks/                 # Individual block implementations
│   ├── emails/                     # Email template and sending
│   ├── env/                        # Environment variable validation
│   ├── telemetry/                  # Analytics and tracking
│   ├── theme/                      # Theme configuration and utilities
│   ├── transactional/              # Transactional service
│   ├── migrations/                 # Database migration CLI
│   ├── playwright/                 # E2E test utilities
│   ├── radar/                      # Monitoring/radar utilities
│   ├── eslint-config-custom/       # Shared ESLint config
│   ├── tsconfig/                   # Shared TypeScript configs
│   └── deprecated/                 # Legacy packages (old bot-engine)
├── ee/                             # Enterprise Edition features and apps
│   ├── apps/                       # EE-specific applications
│   └── packages/                   # EE-specific packages (billing, etc.)
├── load-test/                      # Load testing scripts
└── docs/                           # Documentation source
```

## Directory Purposes

**`apps/builder/`:**
- Purpose: Next.js app for typebot creation and management
- Contains: IDE editor, workspace management, analytics, settings, templates
- Key files: `src/pages/_app.tsx` (main app wrapper), `src/pages/typebots/[typebotId]/edit.tsx` (editor page)

**`apps/builder/src/pages/`:**
- Purpose: Next.js page and API route definitions
- Contains: Auth pages (signin, register), dashboard, typebot pages, API routes
- Structure: `pages/api/` for API routes (tRPC, webhooks, OAuth), `pages/typebots/` for typebot management

**`apps/builder/src/pages/api/`:**
- tRPC catch-all: `[...trpc].ts` - Main API endpoint
- Auth: `auth/[...nextauth].ts` - NextAuth configuration
- Integrations: `integrations/` - OAuth callbacks, webhook handlers
- Stripe: `stripe/webhook.ts` - Payment webhooks
- Storage: `storage/upload-url.ts` - File upload endpoints
- Utilities: `health.ts`, `drain.ts`, `test.ts`

**`apps/builder/src/features/`:**
- Purpose: Domain-driven feature modules for builder functionality
- Organization: Each folder is a self-contained feature with components, API handlers, providers
- Key features:
  - `editor/` - Core drag-and-drop editor with graph/canvas rendering
  - `typebot/` - Typebot CRUD operations
  - `workspace/` - Multi-tenant workspace management
  - `auth/` - Authentication flows
  - `billing/` - Subscription and payments
  - `blocks/` - Block-specific UI and handlers
  - `publish/` - Publishing and sharing
  - `results/` - Chat history and analytics
  - `variables/` - Variable management UI
  - `integrations/` (e.g., `forge/`) - Third-party service integration UI

**`apps/builder/src/components/`:**
- Purpose: Reusable React components shared across features
- Examples: Modals, buttons, form inputs, layout wrappers

**`apps/builder/src/helpers/server/`:**
- Purpose: Server-side utilities for tRPC and API routes
- Key files: `trpc.ts` (tRPC initialization), `context.ts` (request context), `routers/` (procedure definitions)

**`apps/viewer/`:**
- Purpose: Lightweight Next.js app for rendering published typebots
- Contains: Chat interface, result submission, file uploads, WhatsApp integration
- Minimal dependencies: No editor UI, no workspace features

**`apps/viewer/src/pages/[[...publicId]].tsx`:**
- Purpose: Server-side rendered catch-all route for custom domains and public IDs
- Fetches published typebot data, renders appropriate component (TypebotPageV2 or V3)
- Uses `getServerSideProps` to determine if route is viewer URL or custom domain

**`packages/bot-engine/`:**
- Purpose: Core bot session execution engine (exports directly, no src/ directory)
- Entry points: `startSession.ts`, `continueBotFlow.ts`
- Contains: Block execution handlers, session state management, variable parsing, database queries
- Example files:
  - `startSession.ts` - Initialize chat session
  - `continueBotFlow.ts` - Process user input and advance flow
  - `executeGroup.ts` - Execute all blocks in a group
  - `blocks/` - Type-specific block handlers (input, integration, logic, bubble)
  - `queries/` - Database queries (findTypebot, upsertResult)

**`packages/lib/`:**
- Purpose: Shared utilities and helper functions
- Contains: API utilities, validators, markdown processing, S3 integration
- Key files: `logger.ts`, `utils.ts`, `validators/`, `api/`, `s3/`

**`packages/schemas/`:**
- Purpose: Zod validation schemas and TypeScript type definitions
- Contains: All data shape definitions for typebots, blocks, variables, settings
- Examples: `features/typebot/`, `features/blocks/`, `features/chat/`

**`packages/prisma/`:**
- Purpose: Database schema and migrations (Prisma)
- Key files: `schema.prisma` - All database models, `migrations/` - Schema change history

**`packages/variables/`:**
- Purpose: Variable substitution and evaluation logic
- Key functions: `parseVariables()`, `prefillVariables()`, `deepParseVariables()`

**`packages/forge/`:**
- Purpose: Plugin/integration framework for extensible block types
- Contains: Forge SDK, block definitions, repository registry
- `blocks/` - Individual integrations (OpenAI, Stripe, Google Sheets, etc.)

**`ee/`:**
- Purpose: Enterprise Edition features (billing, advanced features)
- May contain: Advanced analytics, custom domains, team management

## Key File Locations

**Entry Points:**
- `apps/builder/src/pages/_app.tsx` - Builder app initialization with providers
- `apps/builder/src/pages/typebots/[typebotId]/edit.tsx` - Editor IDE
- `apps/viewer/src/pages/_app.tsx` - Viewer app minimal setup
- `apps/viewer/src/pages/[[...publicId]].tsx` - Chat interface server-side render
- `apps/builder/src/pages/api/[...trpc].ts` - tRPC API endpoint

**Configuration:**
- `apps/builder/next.config.mjs` - Next.js build config with MDX support
- `apps/builder/tsconfig.json` - TypeScript config with path aliases
- `packages/prisma/schema.prisma` - Database schema definition
- `.env.dev.example` - Example environment variables
- `package.json` - Monorepo root with Turbo scripts

**Core Logic:**
- `packages/bot-engine/startSession.ts` - Initialize chat session
- `packages/bot-engine/continueBotFlow.ts` - Process user messages
- `packages/bot-engine/executeGroup.ts` - Execute flow group logic
- `packages/bot-engine/blocks/` - Block-specific execution handlers
- `apps/builder/src/helpers/server/trpc.ts` - tRPC setup with middleware

**Testing:**
- `apps/builder/src/test/` - E2E tests
- `packages/playwright/` - Playwright test utilities
- `apps/builder/playwright.config.ts` - Playwright configuration

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `TypebotProvider.tsx`, `EditorCanvas.tsx`)
- Utilities/helpers: `camelCase.ts` (e.g., `parseVariables.ts`, `formatEmail.ts`)
- Pages: `kebab-case` or `[bracket]` for dynamic (e.g., `[typebotId]`, `[[...publicId]]`)
- Types/interfaces: Defined in same file or dedicated `types.ts` file
- Constants: `UPPER_SNAKE_CASE` or `camelCase` depending on context

**Directories:**
- Feature folders: `camelCase` (e.g., `botEngine`, `customDomains`)
- Public exports: Index via `index.ts` or direct from `package.json` main field
- Types: Colocated in feature folder or `packages/schemas/features/[feature]/`

**Functions:**
- Async functions for external calls: `async` keyword used
- Component hooks: `use` prefix (e.g., `useTypebot()`)
- Data transformation: Verb-first pattern (e.g., `parseVariables()`, `deepParseVariables()`)

## Where to Add New Code

**New Feature in Builder:**
- Create directory in `apps/builder/src/features/[featureName]/`
- Structure: `api/`, `components/`, `hooks/` subdirectories
- Export from `api/` file for use in tRPC procedures
- Register tRPC procedures in `apps/builder/src/helpers/server/routers/`

**New Component/Module:**
- Reusable components: `apps/builder/src/components/[ComponentName].tsx`
- Feature-specific components: `apps/builder/src/features/[feature]/components/`
- Hooks: `apps/builder/src/hooks/use[HookName].ts`

**New Block Type:**
- Add block schema in `packages/schemas/features/blocks/`
- Create handler in `packages/bot-engine/blocks/[blockType]/`
- Register in Forge if it's an integration: `packages/forge/blocks/[blockName]/`
- Add UI in `apps/builder/src/features/blocks/[blockType]/`

**New Utility/Helper:**
- General utilities: `packages/lib/` (export from `index.ts`)
- Bot engine specific: `packages/bot-engine/` directly
- Variable handling: `packages/variables/`
- Type definitions: `packages/schemas/`

**New API Route (non-tRPC):**
- Webhook handlers: `apps/builder/src/pages/api/[service]/webhook.ts`
- OAuth callbacks: `apps/builder/src/pages/api/credentials/[provider]/callback.ts`
- One-off endpoints: `apps/builder/src/pages/api/[endpoint].ts`

## Special Directories

**`apps/builder/src/i18n/`:**
- Purpose: Internationalization files
- Generated: Yes (from Tolgee translation service)
- Committed: Yes
- Used by: TolgeeProvider for multi-language support

**`packages/deprecated/`:**
- Purpose: Legacy code kept for backward compatibility
- Generated: No
- Committed: Yes
- Should not be used in new features

**`apps/builder/src/assets/`:**
- Purpose: Static images and stylesheets
- Generated: No
- Committed: Yes
- CSS files: `routerProgressBar.css`, `plate.css`, `resultsTable.css`, `custom.css`

**`packages/prisma/migrations/`:**
- Purpose: Database schema version history
- Generated: Yes (by `prisma migrate` command)
- Committed: Yes
- One directory per migration with `migration.sql` and `migration_lock.toml`

**`load-test/`:**
- Purpose: Load/performance testing with k6 or similar
- Generated: No
- Committed: Yes
- For scaling analysis and performance benchmarking

---

*Structure analysis: 2026-02-26*
