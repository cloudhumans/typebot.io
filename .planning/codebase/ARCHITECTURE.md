# Architecture

**Analysis Date:** 2026-02-26

## Pattern Overview

**Overall:** Monorepo with Multi-App Next.js Backend-for-Frontend (BFF) Architecture

**Key Characteristics:**
- Monorepo structure (pnpm workspaces) with shared packages and isolated apps
- Two main Next.js applications (Builder and Viewer) with distinct responsibilities
- tRPC for type-safe RPC communication between frontend and backend
- Database-driven state management with Prisma ORM
- Modular feature-based architecture with horizontal slicing by domain
- Bot engine as a separate publishable package for session execution
- Forge plugin system for extensible integrations
- Server-side rendering for multi-tenant custom domains and SEO

## Layers

**Presentation Layer (Next.js Apps):**
- Purpose: User-facing web applications for building and viewing typebots
- Location: `apps/builder/` (IDE for creating flows) and `apps/viewer/` (chat interface)
- Contains: React components, pages, providers, hooks, and client-side state
- Depends on: tRPC client, shared packages (schemas, lib), Chakra UI, Zustand
- Used by: End users and visitors interacting with typebots

**API Layer (tRPC Backend):**
- Purpose: Type-safe API endpoints for frontend-backend communication
- Location: `apps/builder/src/helpers/server/routers/`, `apps/builder/src/pages/api/[...trpc].ts`, `apps/viewer/src/pages/api/[...trpc].ts`
- Contains: tRPC procedure definitions, context setup, authentication middleware
- Depends on: Database (Prisma), business logic packages, utilities
- Used by: Frontend applications via tRPC client

**Business Logic Layer (Packages):**
- Purpose: Core domain logic extracted into reusable packages
- Location: `packages/bot-engine/`, `packages/lib/`, `packages/logic/`, `packages/variables/`, `packages/results/`, `packages/forge/`
- Contains: Flow execution, variable parsing, data transformations, block handlers
- Depends on: Schemas, database access, external service clients
- Used by: Both apps and potentially external consumers via NPM

**Data Access Layer (Prisma):**
- Purpose: Object-relational mapping and database queries
- Location: `packages/prisma/` (schema definitions and migrations)
- Contains: Prisma schema, database models, migration files
- Depends on: PostgreSQL (via PlanetScale in production)
- Used by: All backend code needing database access

**Shared Packages:**
- Purpose: Reusable utilities and type definitions
- Location: `packages/schemas/`, `packages/lib/`, `packages/env/`, `packages/telemetry/`, `packages/theme/`, etc.
- Contains: Type definitions, validation schemas (Zod), utilities, environment config
- Depends on: External libraries (Zod, Stripe, OpenAI, etc.)
- Used by: All applications and packages

**Plugin/Extension System:**
- Purpose: Pluggable integrations and block types
- Location: `packages/forge/`, `packages/forge/blocks/`
- Contains: Forge SDK, block definitions for third-party services (OpenAI, Stripe, etc.)
- Depends on: Schemas, bot-engine
- Used by: Bot engine during block execution

## Data Flow

**Chat Session Initialization Flow:**

1. **User initiates chat** - Viewer requests bot via public typebot ID or custom domain
2. **Server-side rendering** - `apps/viewer/src/pages/[[...publicId]].tsx` fetches published typebot metadata
3. **Frontend hydration** - Chat component renders with initial typebot data
4. **Start session** - Frontend calls tRPC `startChat` → `packages/bot-engine/startSession.ts`
5. **Session creation** - Engine initializes `SessionState`, creates database result record
6. **First group execution** - `startBotFlow` executes first group blocks, returns initial messages
7. **Display to user** - Messages rendered in chat UI

**Message/Answer Processing Flow:**

1. **User submits answer** - Input value sent to frontend message handler
2. **Validate input** - Answer validated based on input block type (text, number, email, etc.)
3. **Continue bot flow** - Frontend calls tRPC `continueChat` → `continueBotFlow()`
4. **Group execution** - Current group blocks execute, process answer, update variables
5. **Logic evaluation** - Condition blocks route to next group based on variable values
6. **Block handlers** - Integration/action blocks execute (webhooks, email, etc.)
7. **Next group retrieval** - Navigate graph to next group via edges
8. **Session state update** - `SessionState` persists to database via `saveStateToDatabase()`
9. **Response to client** - Next messages and input blocks returned

**Typebot Editing Flow (Builder):**

1. **Edit request** - Builder UI modifies typebot structure (groups, blocks, edges)
2. **State update** - Zustand store and provider state updated optimistically
3. **tRPC mutation** - Change persisted to database via authenticated procedure
4. **Database transaction** - Prisma updates typebot record
5. **Response handling** - Conflict detection, optimistic UI rollback if needed
6. **Real-time sync** - Multi-user collaborators receive updates (via polling or websocket simulation)

**State Management:**
- **Client-side:** Zustand stores for editor state, Chakra UI for UI state
- **Server-side:** PostgreSQL with Prisma as single source of truth
- **Session state:** Serialized SessionState object (version 3) persisted in database
- **Variables:** Dynamically evaluated during execution, stored in Result records

## Key Abstractions

**SessionState:**
- Purpose: Encapsulates complete bot execution context between messages
- Examples: `packages/bot-engine/types.ts`, used throughout `startSession.ts`, `continueBotFlow.ts`
- Pattern: Immutable state object with queue of typebots, current block, variables, visited edges

**Typebot/TypebotInSession:**
- Purpose: Bot definition structure with flow (groups, blocks, edges, variables)
- Examples: Schema definitions in `packages/schemas/`
- Pattern: Versioned structure (v5, v6) to support migrations

**Block Types:**
- Purpose: Extensible block system for different bot behaviors
- Examples: BubbleBlockType (text, image), InputBlockType (text, email), IntegrationBlockType (webhook, OpenAI)
- Pattern: Discriminated unions using type field, handler functions per type in `packages/bot-engine/blocks/`

**Forge Blocks:**
- Purpose: Plugin-based blocks for third-party integrations
- Examples: `packages/forge/blocks/openai/`, `packages/forge/blocks/stripe/`
- Pattern: Pluggable block definitions registered in forge repository

**Result/Chat History:**
- Purpose: Persistent record of user answers and bot execution
- Examples: Prisma model in `packages/prisma/`, stored as JSON in database
- Pattern: Answers array with block IDs and content, variables array with values

**Provider Pattern:**
- Purpose: React context-based dependency injection for app state
- Examples: `apps/builder/src/features/editor/providers/TypebotProvider.tsx`, `WorkspaceProvider`, `UserProvider`
- Pattern: Wraps component tree, provides hooks (useTypebot, useWorkspace)

## Entry Points

**Builder App:**
- Location: `apps/builder/src/pages/_app.tsx`
- Triggers: User navigates to builder domain
- Responsibilities: Initializes Next.js app with providers (SessionProvider, ChakraProvider, TypebotProvider), sets up tRPC client, handles routing

**Builder Editor:**
- Location: `apps/builder/src/pages/typebots/[typebotId]/edit.tsx`
- Triggers: User clicks "Edit" on a typebot
- Responsibilities: Renders drag-and-drop flow editor, manages block selection/manipulation, real-time preview

**Viewer App:**
- Location: `apps/viewer/src/pages/_app.tsx`
- Triggers: Visitor navigates to published typebot URL
- Responsibilities: Minimal setup (no auth), serves chat interface from published typebot data

**Viewer Chat:**
- Location: `apps/viewer/src/pages/[[...publicId]].tsx`
- Triggers: User accesses published typebot via public ID or custom domain
- Responsibilities: Server-side fetch of published typebot, render appropriate TypebotPageV2/V3 component, handle chat lifecycle

**API Routes:**
- tRPC Catch-all: `apps/builder/src/pages/api/[...trpc].ts` - Routes all tRPC calls
- Webhook handlers: `apps/builder/src/pages/api/stripe/webhook.ts`, `apps/builder/src/pages/api/integrations/`
- OAuth callbacks: `apps/builder/src/pages/api/credentials/google-sheets/callback.ts`
- Health checks: `apps/builder/src/pages/api/health.ts`

**Bot Engine:**
- Location: `packages/bot-engine/startSession.ts` and `continueBotFlow.ts`
- Triggers: Chat start/continue requests from viewer
- Responsibilities: Execute bot flow logic, manage session state, evaluate conditions, execute blocks

## Error Handling

**Strategy:** Layered error handling with tRPC as the error boundary

**Patterns:**
- **tRPC Errors:** TRPCError with code (UNAUTHORIZED, NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR)
- **Input validation:** Zod schemas validate request data, errors returned in flattened format
- **Database errors:** Caught and wrapped as tRPC errors with user-friendly messages
- **Bot execution:** Try-catch blocks in executeGroup, resumeWebhookExecution with logging to Sentry
- **Client-side:** Toast notifications for errors, fallback UI for not found/error states
- **Logging:** Datadog middleware logs all tRPC calls, Sentry captures exceptions

## Cross-Cutting Concerns

**Logging:**
- Server-side: `@typebot.io/lib/logger.ts` with Winston, Datadog middleware via tRPC
- Client-side: Sentry client setup in `apps/builder/sentry.client.config.ts`
- Bot execution: Detailed logs in SessionState for debugging (via `packages/bot-engine/logs/`)

**Validation:**
- Input: Zod schemas at API boundary
- Database: Prisma schema constraints
- Bot execution: Block-specific validators (email format, phone number, date formats)

**Authentication:**
- Session-based via NextAuth (adapter-based, supports multiple strategies)
- tRPC middleware `isAuthed` checks `ctx.user.id` before authenticated procedures
- API tokens for external integrations stored encrypted in Credentials table
- Custom "Eddie" auth flow for embedded typebots (via `features/embedded-auth/`)

**Authorization:**
- Workspace membership checks in tRPC context
- Typebot ownership verification before mutations
- Public/private typebot visibility enforced in queries

**Monitoring:**
- Sentry for error tracking and performance monitoring
- Datadog for distributed tracing and metrics
- Health check endpoints at `/api/health` for uptime monitoring

---

*Architecture analysis: 2026-02-26*
