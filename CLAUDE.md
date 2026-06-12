# CLAUDE.md — Typebot

## What this is

Visual chatbot builder (fork of Typebot.io). pnpm monorepo with two Next.js apps:

- **builder** (port 3002) — Chatbot flow editor
- **viewer** (port 3003) — Chatbot flow executor + MCP endpoint (`/api/mcp`)

## MCP endpoint

`POST /api/mcp` on the **viewer** exposes tool-type typebots as MCP tools, filtered by `x-tenant` header. The builder route was removed (cutover to viewer completed 2026-06-11); the shared logic lives in `@typebot.io/mcp-tools`. Key behaviors:

- **Bearer auth:** Every non-preflight request (GET/POST/DELETE) must send `Authorization: Bearer <TYPEBOT_TOOLS_API_TOKEN>`. `OPTIONS` preflight is exempt. Auth is HTTP-level — a missing/wrong token returns **HTTP 401** `{"error":"Unauthorized"}`, not a JSON-RPC 200 envelope. It is **fail-closed**: if `TYPEBOT_TOOLS_API_TOKEN` is unset on the server, every request is rejected (401) and a warning is logged. The MCP proxy (`mcp/`, `/typebot/mcp` mount) injects this token outbound. The guard is `checkBearerAuth` in `@typebot.io/mcp-tools` (timing-safe), unit-tested in `packages/mcp-tools/helpers/checkBearerAuth.test.ts`.
- **Published vs draft tools:** By default, only published typebots appear. The `X-Include-Drafts: true` HTTP header (set by claudia web-api when proxying from the Tools page) includes unpublished tools with `_meta.isPublished: false`.
- **Tool typebots:** Special typebot flows that act as AI agent tools. Created via `typebot.createTypebot` tRPC mutation.
- **Known gotchas:** `outgoingEdgeId` is required on blocks, `publicId` must be set for publishing, Script blocks need specific format, `bodyPath` for array params, array values must be stringified.

## Auth

- Magic link authentication via email (captured by Mailhog locally)
- Seeded user: `claudia@acme.inc`
- Cognito SSO for embedded mode inside CloudChat (JWT verification in `verifyCognitoToken`)
- API token auth populates `cognitoClaims` for admin users

### Embedded auth — critical race condition

When typebot is embedded inside CloudChat, the `UserProvider` has a full early-return bypass for embedded mode (`if (isEmbedded) return`). **Do not narrow this bypass.** The Cognito JWT → NextAuth session handoff has a transient window where `session.user` is undefined. If the logout/redirect logic runs during this window, it causes a signin loop. Any changes to `UserProvider`, session handling, or embedded bypass must be tested against the actual embedded auth flow — code-level review reasoning alone is not sufficient.

## Stack

- TypeScript, Next.js, pnpm 8, tRPC, Prisma, PostgreSQL, React
- Monorepo: `apps/` (builder, viewer, docs) + `packages/` (shared libs)
- Dev: `pnpm turbo dev` for both builder and viewer

## Running

All docker compose commands from the composezao root (`/home/fabio/workspace/composezao-da-massa`):

```bash
# Dev (runs via docker compose with HMR)
docker compose up typebot-builder typebot-viewer -d

# Access builder
open http://localhost:3002

# Sign in: enter claudia@acme.inc, get magic link from Mailhog at http://localhost:8025
```
