# External Integrations

**Analysis Date:** 2026-02-26

## APIs & External Services

**Payment Processing:**
- Stripe - Payment processing and subscription management
  - SDK/Client: `stripe` 12.13.0
  - Auth: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`
  - Config: Price IDs for plans (`STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, etc.)
  - Usage: Billing system in builder app, webhook handling via `STRIPE_WEBHOOK_SECRET`

**AI & LLM:**
- OpenAI - Chat completions and AI features
  - SDK/Client: `openai` 4.47.1
  - Auth: API key via credentials stored in database
  - Integration: `packages/bot-engine/apiHandlers/getMessageStream.ts`
  - Streaming support: Real-time chat completions

**Spreadsheet Integration:**
- Google Sheets - Data integration and storage
  - SDK/Client: `google-spreadsheet` 4.1.1
  - Auth: OAuth 2.0 via NextAuth Google provider
  - Credentials: Stored in Prisma `Credentials` table
  - Actions: Insert row, update row, read cells
  - Files: `packages/bot-engine/blocks/integrations/googleSheets/`

**Email Services:**
- SMTP Email - Transactional email via Nodemailer
  - SDK/Client: `nodemailer` 6.9.8
  - Auth: `SMTP_USERNAME`, `SMTP_PASSWORD`
  - Config: `SMTP_HOST`, `SMTP_PORT` (default 25), `SMTP_SECURE`, `SMTP_AUTH_DISABLED`
  - From: `NEXT_PUBLIC_SMTP_FROM`
  - Usage: User invitations, notifications, password resets

**Webhooks:**
- User Webhooks - Custom outgoing webhooks from typebot flows
  - Integration: `packages/bot-engine/blocks/integrations/webhook/`
  - Method: HTTP POST to user-defined endpoints
  - Test endpoint: `apps/builder/src/pages/api/typebots/[typebotId]/blocks/[blockId]/testWebhook.ts`

**Image & Media Services:**
- Unsplash - Image library for bot backgrounds
  - SDK/Client: `unsplash-js` 7.0.18
  - Auth: `NEXT_PUBLIC_UNSPLASH_APP_NAME`, `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY`
  - Usage: Image search and embed in builder UI

- Giphy - GIF search functionality
  - SDK/Client: `@giphy/js-fetch-api`, `@giphy/react-components`, `@giphy/js-types`
  - Auth: `NEXT_PUBLIC_GIPHY_API_KEY`
  - Usage: GIF picker in builder

**MCP Protocol:**
- Model Context Protocol (MCP)
  - SDK/Client: `@modelcontextprotocol/sdk` 1.0.0
  - Integration: `apps/builder/src/features/mcp/`
  - Purpose: Integration with Claude and other AI tools
  - JSON protocol for tool definitions

## Data Storage

**Databases:**
- PostgreSQL 13+ (primary)
  - Connection: `DATABASE_URL` (postgresql:// URL format)
  - Client: Prisma ORM via `@prisma/client` 5.12.1
  - Schema: `packages/prisma/postgresql/schema.prisma`
  - Features: Full ACID transactions, metrics preview features enabled
  - User data: Workspaces, typebots, results, credentials, sessions

- MySQL 8+ (alternative, self-hosted)
  - Connection: `DATABASE_URL` (mysql:// URL format)
  - Client: Prisma ORM
  - Schema: `packages/prisma/mysql/schema.prisma`
  - Parity: Full schema parity with PostgreSQL

- PlanetScale (cloud MySQL)
  - Client: `@planetscale/database` 1.8.0
  - Connection via `DATABASE_URL`
  - Used in viewer app for serverless compatibility

**File Storage:**
- S3-compatible object storage (MinIO or AWS S3)
  - Client: `minio` 7.1.3
  - Connection: `S3_ENDPOINT`, `S3_PORT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Config: `S3_BUCKET` (default: 'typebot'), `S3_REGION`, `S3_SSL` (default: true)
  - Public domain: `S3_PUBLIC_CUSTOM_DOMAIN` for custom CDN
  - Usage: User file uploads, bot media storage
  - Files: `packages/lib/s3/generatePresignedPostPolicy.ts`, `packages/lib/s3/getFileTempUrl.ts`

**Caching:**
- Upstash Redis (optional)
  - Connection: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - SDK: `@upstash/redis` 1.22.0, `@upstash/ratelimit` 0.4.3
  - Purpose: Rate limiting and distributed caching
  - Used in: Embedded auth flows for request throttling

- Node Cache (in-memory, local)
  - SDK: `node-cache` 5.1.2
  - Usage: Local development and single-instance deployments

## Authentication & Identity

**Auth Provider (Primary):**
- Next Auth 4.22.1 - Multi-provider authentication
  - Implementation: Session-based with JWT tokens
  - File: `apps/builder/src/pages/api/auth/[...nextauth].ts`
  - Database: Prisma with Account, Session, User models

**OAuth Providers (Configurable):**
- GitHub
  - Env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - Provider: NextAuth GitHub provider

- Google
  - Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Scopes: Drive, Sheets API for integrations
  - Client library: `google-auth-library` 8.9.0

- Facebook
  - Env: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
  - Provider: NextAuth Facebook provider

- GitLab
  - Env: `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `GITLAB_BASE_URL`, `GITLAB_NAME`
  - Default URL: https://gitlab.com
  - Groups: Optional `GITLAB_REQUIRED_GROUPS` for access control

- Azure AD
  - Env: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
  - Provider: OpenID Connect

- Keycloak
  - Env: `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_REALM`, `KEYCLOAK_BASE_URL`
  - Provider: Custom OAuth via well-known URL

- Custom OAuth
  - Env: `CUSTOM_OAUTH_*` variables for fully custom provider
  - Fields: Well-known URL, user ID/email/name/image paths

**AWS Cognito:**
- Embedded authentication for CloudChat
  - Env: `COGNITO_ISSUER_URL`, `CLOUDCHAT_COGNITO_APP_CLIENT_ID`, `AWS_COGNITO_REGION`
  - Integration: `apps/builder/src/features/auth/types/cognito.ts`
  - Purpose: OAuth flow for embedded bot viewer

**Email Authentication:**
- Email provider via NextAuth
  - Provider: NextAuth Email provider for passwordless auth
  - SMTP: Uses configured SMTP settings for email links

**Credentials:**
- Credentials provider for development/testing
  - Provider: NextAuth Credentials provider

**JWT & Token Management:**
- Libraries: `jsonwebtoken` 9.0.1, `jose` 6.1.3
- Token storage: Database sessions and JWT in cookies
- Encryption: Via `ENCRYPTION_SECRET` (32-char key)

## Monitoring & Observability

**Error Tracking:**
- Sentry - Error monitoring and performance tracking
  - SDK: `@sentry/nextjs` 7.77.0
  - Auth: `SENTRY_AUTH_TOKEN` (optional for releases)
  - Config: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_PROJECT`, `SENTRY_ORG`
  - Integration: Error boundaries, API error capture, user context
  - Files: `apps/builder/src/pages/_error.tsx`, API handlers

**Logs:**
- Winston 3.17.0 - Structured logging
  - Usage: Server-side logging for debugging and monitoring
  - Format: JSON logs for production parsing

**APM & Tracing:**
- Datadog - Application Performance Monitoring
  - Tracer: `dd-trace` 5.53.0
  - Env: `DEBUG_DATADOG` (optional)
  - Purpose: Request tracing, performance metrics, dashboards

**Analytics:**
- PostHog - Product analytics and feature tracking
  - SDK: `posthog-node` 3.1.1 (backend)
  - Auth: `NEXT_PUBLIC_POSTHOG_KEY` (client), optional host override
  - Default Host: https://app.posthog.com
  - Usage: User behavior analytics, feature flags

## CI/CD & Deployment

**Hosting:**
- Vercel - Primary deployment platform
  - Projects: `VERCEL_BUILDER_PROJECT_NAME`, `VERCEL_LANDING_PROJECT_NAME`
  - Viewer: `NEXT_PUBLIC_VERCEL_VIEWER_PROJECT_NAME`
  - Token: `VERCEL_TOKEN` (for deployments)
  - Team: `VERCEL_TEAM_ID` (optional)
  - Commit info: `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`
  - Preview URLs: Auto-detected for preview branches

- Docker - Container deployment
  - Files: `Dockerfile`, `docker-compose.dev.yml`, `docker-compose.build.yml`
  - Dev environment: PostgreSQL 13, MinIO S3, typebot services

**CI Pipeline:**
- GitHub Actions
  - Workflows: `.github/workflows/`
  - Build, test, deploy automation

## Environment Configuration

**Required env vars (all deployments):**
- `DATABASE_URL` - PostgreSQL or MySQL connection
- `ENCRYPTION_SECRET` - 32-character hex string
- `NEXTAUTH_URL` - NextAuth callback URL
- `NEXT_PUBLIC_VIEWER_URL` - Comma-separated bot viewer URLs
- `COGNITO_ISSUER_URL` - AWS Cognito endpoint
- `CLOUDCHAT_COGNITO_APP_CLIENT_ID` - Cognito client ID

**Optional env vars:**
- S3 storage: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs
- OpenAI: API key via credential creation, not env var
- SMTP: `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`
- OAuth providers: All `*_CLIENT_ID` and `*_CLIENT_SECRET`
- Monitoring: `NEXT_PUBLIC_SENTRY_DSN`, Datadog, PostHog keys
- Upstash Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Secrets location:**
- Development: `.env` and `.env.example` files
- Example files: `.env.example`, `.env.dev.example`
- Production: Environment variables in Vercel dashboard or hosting provider
- Credentials database: Encrypted in Prisma `Credentials` table

## Webhooks & Callbacks

**Incoming:**
- NextAuth Callbacks - OAuth provider redirects
  - Endpoints: `/api/auth/signin/*`, `/api/auth/callback/*`
  - Handlers: `apps/builder/src/pages/api/auth/[...nextauth].ts`

- Stripe Webhooks - Billing events
  - Endpoint: `/api/webhooks/stripe` (implicit via NextAuth)
  - Secret: `STRIPE_WEBHOOK_SECRET`
  - Events: Payment success, subscription changes, invoice events

- Custom Webhook Testing
  - Endpoint: `apps/builder/src/pages/api/typebots/[typebotId]/blocks/[blockId]/testWebhook.ts`
  - Purpose: Test user-defined webhooks from bot flows

**Outgoing:**
- Bot Webhook Blocks - From typebot flows
  - Configuration: User-defined in block settings
  - Execution: `packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`
  - Method: HTTP POST to arbitrary endpoints

- Telemetry Webhooks (optional)
  - Env: `MESSAGE_WEBHOOK_URL`, `USER_CREATED_WEBHOOK_URL`
  - Purpose: Custom event streaming to external systems
  - Usage: Analytics and event tracking integration

- Google Drive OAuth Callback
  - Endpoint: `apps/builder/src/pages/api/credentials/google-sheets/callback.ts`
  - Purpose: Store Google OAuth tokens in credentials

## Rate Limiting

**Embedded Auth:**
- Upstash Ratelimit integration
  - Purpose: Throttle embedded bot authentication requests
  - Config: Via `UPSTASH_REDIS_REST_URL` and token

**Chat API Timeout:**
- Env: `CHAT_API_TIMEOUT` (milliseconds, configurable)
- Default: Server default
- Purpose: Limit bot execution time

## Localization

**Tolgee - Translation Management:**
- SDK: `@tolgee/cli` 1.3.2, `@tolgee/react` 5.19.0
- API: `NEXT_PUBLIC_TOLGEE_API_KEY`, `NEXT_PUBLIC_TOLGEE_API_URL`
- Default URL: https://tolgee.server.baptistearno.com
- Locale files: `apps/builder/src/i18n/`
- CLI: `locales:pull`, `locales:push`, `locales:sync` scripts

## Safety & Security

**Content Moderation (RADAR):**
- Keywords config: `RADAR_HIGH_RISK_KEYWORDS`, `RADAR_INTERMEDIATE_RISK_KEYWORDS`
- Cumulative patterns: `RADAR_CUMULATIVE_KEYWORDS`
- Files: `packages/radar/`

**XSS Prevention:**
- DOMPurify - HTML sanitization
- URL sanitizer - Safe URL handling
- Validation: All user input validated with Zod

---

*Integration audit: 2026-02-26*
