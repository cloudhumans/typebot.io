# Technology Stack

**Analysis Date:** 2026-02-26

## Languages

**Primary:**
- TypeScript 5.4.5 - Used throughout all applications and packages for type safety
- JavaScript - Build scripts and configuration files

**Secondary:**
- SQL - PostgreSQL/MySQL schemas via Prisma
- CSS/PostCSS - Styling with Tailwind CSS

## Runtime

**Environment:**
- Node.js (LTS compatible) - Server-side runtime

**Package Manager:**
- pnpm 8.15.4 - Monorepo package manager
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 14.1.0 - Full-stack React framework for builder and viewer applications
- React 18.2.0 - UI component library
- Solid.js 1.7.8 - Lightweight JS framework used in embeds

**API & Backend:**
- tRPC 10.40.0 - End-to-end typesafe API framework
- Prisma 5.12.1 - ORM for database access
- Next Auth 4.22.1 - Authentication middleware

**UI Components & Styling:**
- Chakra UI 2.7.1 - Component library for builder
- Tailwind CSS 3.3.3 - Utility-first CSS for styling
- Framer Motion 10.3.0 - Animation library
- Plate Editor 30.4.5-30.7.0 - Rich text editor components
- CodeMirror 6.0.1 - Code editor integration

**State Management:**
- Zustand 4.5.0 - Lightweight state management
- TanStack React Query 4.29.19 - Server state management
- TanStack React Table 8.9.3 - Table component library

**Testing:**
- Playwright 1.43.1 - End-to-end testing framework
- @playwright/test - Test runner

**Build & Dev Tools:**
- Turbo 1.11.3 - Monorepo task orchestration
- Rollup 3.26.2 - Bundle JS embeds packages
- TypeScript compiler - Type checking
- ESLint 8.44.0 - Code linting
- Prettier 2.8.8 - Code formatting

## Key Dependencies

**Critical:**
- @sentry/nextjs 7.77.0 - Error tracking and monitoring
- openai 4.47.1 - OpenAI API client for chat completions
- stripe 12.13.0 - Stripe payments SDK
- nodemailer 6.9.8 - Email sending library
- google-spreadsheet 4.1.1 - Google Sheets API client
- google-auth-library 8.9.0 - Google OAuth authentication

**Infrastructure:**
- minio 7.1.3 - S3-compatible object storage client
- pg 8.13.1 - PostgreSQL client
- @planetscale/database 1.8.0 - PlanetScale database client
- jose 6.1.3 - JWT token handling
- jsonwebtoken 9.0.1 - JWT generation and verification
- ky 1.2.3 - HTTP fetch wrapper

**Code Execution:**
- isolated-vm 4.7.2 - Sandboxed JavaScript VM for executing user scripts
- chrono-node 2.7.5 - Natural language date parsing

**Security & Validation:**
- zod 3.22.4 - TypeScript-first schema validation
- dompurify 3.0.6 - XSS prevention for HTML
- @braintree/sanitize-url 7.0.1 - URL sanitization

**Date/Time:**
- date-fns 2.30.0 - Date utility library
- date-fns-tz 2.0.0 - Timezone support

**Formatting & Parsing:**
- marked 9.0.3 - Markdown to HTML parser
- papaparse 5.4.1 - CSV parsing
- node-html-parser 6.1.5 - HTML parsing
- libphonenumber-js 1.10.37 - Phone number parsing and validation

**Monitoring & Analytics:**
- dd-trace 5.53.0 - Datadog APM tracer
- posthog-node 3.1.1 - PostHog analytics (backend)
- winston 3.17.0 - Logging library

**Miscellaneous:**
- json-canonicalize 2.0.0 - JSON canonicalization for MCP protocol
- node-cache 5.1.2 - In-memory caching
- immer 10.0.2 - Immutable state updates
- deep-object-diff 1.1.9 - Object diffing
- canvas-confetti 1.6.0 - Confetti animation effect

## Configuration

**Environment:**
- Environment variables validated with Zod in `packages/env/env.ts`
- Runtime environment variable injection for browser via `__ENV` global
- Multi-environment support: development, staging, production, test

**Key Configs Required:**
- `DATABASE_URL` - PostgreSQL or MySQL connection string
- `ENCRYPTION_SECRET` - 32-character encryption key
- `NEXTAUTH_URL` - NextAuth callback URL
- `NEXT_PUBLIC_VIEWER_URL` - Public bot viewer URL(s)
- `COGNITO_ISSUER_URL` - AWS Cognito endpoint
- `CLOUDCHAT_COGNITO_APP_CLIENT_ID` - Cognito app client ID

**Build:**
- `turbo.json` - Monorepo task pipeline configuration
- `.prettierrc` - Prettier code formatting config (trailingComma: es5, tabWidth: 2, semi: false, singleQuote: true)
- `typescript` - Shared tsconfig in `packages/tsconfig`
- `eslint-config-custom` - Custom ESLint configuration

## Platform Requirements

**Development:**
- Docker & Docker Compose - For local PostgreSQL, MinIO S3
- Node.js 18+ with pnpm
- Bash/shell environment

**Production:**
- Vercel (primary deployment platform, with auto-deployment support)
- PostgreSQL 13+ or MySQL 8+
- S3-compatible object storage (AWS S3 or MinIO)
- Optional: Upstash Redis for rate limiting
- Optional: Datadog for APM tracing
- Optional: Sentry for error tracking

**Deployment Targets:**
- Vercel (built-in, multi-project support for builder, viewer, docs)
- Docker container via Dockerfile
- Self-hosted on any Node.js-compatible server

---

*Stack analysis: 2026-02-26*
