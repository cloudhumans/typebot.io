# CloudChat-Embedded JIT User Provisioning — Design

- Date: 2026-05-06
- Status: Approved (design)
- Scope: `typebot.io` only
- Adjacent PRs / context:
  - Bug surface: `cloudhumans/cloudchat-saas` (CloudChat embed loads Eddie via `?embedded=true&jwt=...`)
  - Related infra: `cloudhumans/typebot.io-manifests` (CSP/CORS allowlist for embed)

## Problem

When a CloudChat user opens Eddie embedded for the first time, the iframe shows
`Failed to load flow builder. Please reload the page.` Cause: the `cloudchat-embedded`
NextAuth provider in `apps/builder/src/pages/api/auth/[...nextauth].ts` does
`prisma.user.findUnique({ where: { email } })` and returns `null` if the user does
not yet exist in typebot's database. The `CredentialsProvider` (which `cloudchat-embedded`
uses) does not invoke the NextAuth adapter's `createUser` by design, so first-time
users are stuck.

The current workaround is to force users through the regular `custom-oauth` Cognito
flow first; that flow runs `customAdapter.createUser` and inserts the row. This is
manual and hostile to onboarding.

## Goal

Provision the typebot `User` row just-in-time when a valid CloudChat Cognito JWT
is presented in the embedded auth flow, so that CloudChat-onboarded users land
directly in Eddie without an extra sign-in step.

## Non-goals

- Refactor or otherwise modify the existing OAuth path (`customAdapter.createUser`).
  The change is purely additive on the embedded path.
- Add a default workspace, default API token, or process invitations for JIT users.
  CloudChat-managed users access workspaces via the `custom:eddie_workspaces` claim
  (already wired through `getCognitoAccessibleWorkspaceIds` and `listWorkspaces`).
- Change `verifyCognitoToken`. Signature/issuer/audience verification stays as-is.
- Rate-limit the embedded auth path. Out of scope; can be revisited if abuse appears.
- Add staging/integration tests against a real Postgres. Local UAT covers the gap.

## Decisions (with rationale)

| Decision | Choice | Rationale |
|---|---|---|
| Security policy | Any valid Cognito JWT provisions | Parity with the existing `custom-oauth` path. The JWT signature + audience (`CLOUDCHAT_COGNITO_APP_CLIENT_ID`) check is the gate. No extra allowlist. |
| Code organization | Surgical: new isolated helper for JIT only | Minimize blast radius. `customAdapter.createUser` is byte-for-byte unchanged. Accept ~8 lines of duplication between the two creation paths. |
| Race handling | Catch Prisma `P2002`, refetch | Two concurrent tabs both miss `findUnique` → both call create → second hits unique violation → catches and refetches the winner's row. |
| Observability | Structured `info` log on success, `warn` on refusal | Permits Datadog queries (`service:typebot-builder JIT-provisioned`) for monitoring abuse without introducing new telemetry events or rate-limit infra. |
| `DISABLE_SIGNUP` gate | **Not** enforced on JIT path | The flag exists to hide the self-service signup button. CloudChat users authenticate upstream via Cognito; the gate does not apply. |
| Default workspace | **Not** created | Workspace access for CloudChat users comes from the `custom:eddie_workspaces` claim. `listWorkspaces.getWorkspaceFilter` already returns workspaces matching `cognitoAccess.ids`. |
| Default API token | **Not** created | API tokens are for OAuth-flow users calling typebot's REST API. CloudChat-embedded users authenticate via JWT redirect each session. |
| Invitation processing | **Not** in JIT path | Typebot invitations are an artifact of the standalone product. CloudChat-managed users do not receive them in practice. |
| Field mapping | `email`, `name`, `emailVerified`, `image` from Cognito payload | `email` ← `payload.email` (validated). `name` ← `payload.name ?? null`. `emailVerified` ← `payload.email_verified === true ? new Date() : null`. `image` ← `null` (Cognito `picture` claim not standardly emitted). |
| Testing | Vitest unit on helper + Vitest unit on `authorize` + local UAT (3 modes) | Vitest matches existing convention. Unit tests cover logic; UAT covers the embed UX, dev token mapping, and race. No staging available; rely on prod observability for JWKS-real validation. |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/builder/src/pages/api/auth/[...nextauth].ts               │
│                                                                 │
│  cloudchat-embedded provider (CredentialsProvider, ~155-211)   │
│  ├─ verifyCognitoToken(token)                       (existing) │
│  ├─ payload email validation                            (NEW)  │
│  ├─ findUnique({ email })                                       │
│  ├─ if !user:                                           (NEW)  │
│  │    try createCloudChatEmbeddedUser(...)                      │
│  │    catch P2002 → refetch findUnique                          │
│  │    catch other → logger.warn + return null                   │
│  └─ return user (with cognitoClaims)                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ apps/builder/src/features/auth/helpers/                        │
│   createCloudChatEmbeddedUser.ts                       (NEW)   │
│                                                                 │
│   createCloudChatEmbeddedUser({                                 │
│     p, email, name, emailVerified, image                        │
│   }) → User                                                     │
│   ├─ p.user.create({ email, name, emailVerified, image,         │
│   │   onboardingCategories: [] })   ← User row only             │
│   └─ trackEvents([{ name: 'User created', ... }])               │
└─────────────────────────────────────────────────────────────────┘

(Untouched but referenced)

  apps/builder/src/features/auth/api/customAdapter.ts            (unchanged)
  apps/builder/src/features/auth/helpers/verifyCognitoToken.ts   (unchanged)
  apps/builder/src/features/workspace/api/listWorkspaces.ts      (unchanged)
```

## Components

### New file: `apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.ts`

```ts
import { PrismaClient, User } from '@typebot.io/prisma'
import { trackEvents } from '@typebot.io/telemetry/trackEvents'

type CreateCloudChatEmbeddedUserInput = {
  p: PrismaClient
  email: string
  name?: string | null
  emailVerified?: Date | null
  image?: string | null
}

export const createCloudChatEmbeddedUser = async ({
  p,
  email,
  name,
  emailVerified,
  image,
}: CreateCloudChatEmbeddedUserInput): Promise<User> => {
  const user = await p.user.create({
    data: { email, name, emailVerified, image, onboardingCategories: [] },
  })

  await trackEvents([
    {
      name: 'User created',
      userId: user.id,
      data: { email, name: name?.split(' ')[0] },
    },
  ])

  return user
}
```

Responsibility: minimal `User` row + `'User created'` telemetry. No workspace,
no API token, no invitation handling.

### New file: `apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.ts`

```ts
import { Prisma } from '@typebot.io/prisma'

export const isPrismaUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
```

### Modified file: `apps/builder/src/pages/api/auth/[...nextauth].ts`

In the `cloudchat-embedded` provider's `authorize` callback, replace:

```ts
const user = await prisma.user.findUnique({ where: { email: payload.email } })
if (!user) return null
```

with the JIT block (full code under "Final shape" below).

### Untouched

- `apps/builder/src/features/auth/api/customAdapter.ts`
- `apps/builder/src/features/auth/helpers/verifyCognitoToken.ts`
- `apps/builder/src/features/auth/helpers/getNewUserInvitations.ts`
- `apps/builder/src/features/auth/helpers/convertInvitationsToCollaborations.ts`
- `apps/builder/src/features/auth/helpers/joinWorkspaces.ts`
- `apps/builder/src/features/workspace/helpers/parseWorkspaceDefaultPlan.ts`
- All other NextAuth providers

## Data flow

### Happy path — first-time CloudChat user

```
Browser (CloudChat iframe)
  │  GET /typebots/{id}/edit?embedded=true&jwt=...
  ▼
NextAuth → cloudchat-embedded.authorize
  ├─ verifyCognitoToken(token) → payload                 (JWKS in prod)
  ├─ payload.email validation                            (NEW)
  ├─ prisma.user.findUnique({ email }) → null
  ├─ createCloudChatEmbeddedUser({ p, email, name,
  │                                emailVerified })
  │   ├─ prisma.user.create({ email, name, emailVerified,
  │   │                       image, onboardingCategories: [] })
  │   └─ trackEvents([{ name: 'User created', ... }])
  ├─ logger.info('JIT-provisioned cloudchat-embedded user',
  │              { userId, email, hubRole, eddieWorkspacesCount })
  └─ return DatabaseUserWithCognito (cloudChatAuthorization: true,
                                     cognitoTokenExp)
        │
        ▼
NextAuth jwt callback (existing) → session cookie emitted
        │
        ▼
Browser → /typebots/{id}/edit
  │
  ├─ trpc workspace.listWorkspaces (existing)
  │   └─ getCognitoAccessibleWorkspaceIds(user) → cognitoAccess
  │   └─ findMany({ OR: [{ members: { some: { userId } } },
  │                      { id: { in: cognitoAccess.ids } }] })
  │   └─ returns workspaces from eddie_workspaces claim
  │
  └─ Editor loads
```

### Happy path — returning user

`findUnique` hits, JIT block is skipped, return user as before.

### Race — two concurrent tabs, fresh user

```
Tab A                                    Tab B
  ├─ findUnique → null                     ├─ findUnique → null
  ├─ createCloudChatEmbeddedUser           ├─ createCloudChatEmbeddedUser
  │   user.create OK                       │   user.create blocks on PG
  ├─ logger.info JIT-provisioned           │
  └─ return user                           │   PG returns P2002
                                           ├─ catch isPrismaUniqueViolation → true
                                           ├─ findUnique → user (created by A)
                                           ├─ logger.info race resolved
                                           └─ return user
```

Both authenticate. Side effects (User row, telemetry) fire exactly once.

### Refusal — JIT path internal error (rare)

DB outage / `trackEvents` throws / non-P2002 Prisma error:

```
... cloudchat-embedded.authorize ...
  ├─ findUnique → null
  ├─ createCloudChatEmbeddedUser throws (not P2002)
  ├─ catch interno → NÃO é P2002
  ├─ logger.warn 'cloudchat-embedded JIT refused' { email, reason }
  └─ return null
        │
        ▼
NextAuth signIn → { ok: false }
        │
        ▼
useEmbeddedAuth → setAuthError('Failed to load flow builder. Please reload the page.')
```

Note: telemetry calls are best-effort inside `createCloudChatEmbeddedUser` —
the helper wraps `trackEvents` in a try/catch. A telemetry outage logs
`warn 'cloudchat-embedded telemetry failed (user provisioned)'` and the helper
still returns the freshly-created user, so the auth path completes successfully.
This deviates intentionally from `customAdapter.createUser`, which propagates
telemetry errors. The JIT path is on the critical-auth hot path; we do not want
a Datadog/StatsD hiccup to look like an authentication failure to the user.

### Refusal — invalid JWT (existing behavior)

```
... cloudchat-embedded.authorize ...
  ├─ verifyCognitoToken throws
  ├─ catch externo (existente): logger.error 'Error in cloudchat-embedded authorize'
  └─ return null
```

### Refusal — payload missing email (NEW)

```
... cloudchat-embedded.authorize ...
  ├─ verifyCognitoToken → payload (no email)
  ├─ logger.warn 'cloudchat-embedded payload missing email'
       { sub, cognitoUsername }
  └─ return null
```

## Error handling

| Scenario | Detection | Behavior | Log |
|---|---|---|---|
| Token missing/invalid/expired/wrong audience | `verifyCognitoToken` throws | catch externo (existing), `return null` | `error 'Error in cloudchat-embedded authorize'` |
| Payload missing/empty `email` | explicit check after verify | `return null` | `warn 'cloudchat-embedded payload missing email'` |
| `findUnique` failure (DB issue) | catch externo (existing) | `return null` | `error` (same outer) |
| User exists | `findUnique` returns user | `return user` | (silent; existing NextAuth jwt log fires) |
| User does not exist, create succeeds | findUnique null + create OK | `return user` | `info 'JIT-provisioned cloudchat-embedded user' { userId, email, hubRole, eddieWorkspacesCount }` |
| Race — P2002 caught, refetch returns user | inner catch | `return user` | `info 'cloudchat-embedded JIT race resolved'` |
| Race — P2002 caught, refetch returns null | inner catch (rare/strange) | `throw` (caught by outer, returns null) | `error` outer |
| Other Prisma error during create | inner catch | `return null` | `warn 'cloudchat-embedded JIT refused' { email, reason }` |
| `trackEvents` throws (after user.create OK) | inner catch in `createCloudChatEmbeddedUser` | swallowed; user returned; auth proceeds | `warn 'cloudchat-embedded telemetry failed (user provisioned)' { userId, email, error }` |

### Final shape of the modified `authorize` block

```ts
async authorize(credentials) {
  try {
    if (!credentials?.token) return null

    const payload = await verifyCognitoToken({
      cognitoAppClientId: env.CLOUDCHAT_COGNITO_APP_CLIENT_ID,
      cognitoIssuerUrl: env.COGNITO_ISSUER_URL,
      cognitoToken: credentials.token,
    })

    if (typeof payload.email !== 'string' || payload.email.length === 0) {
      logger.warn('cloudchat-embedded payload missing email', {
        sub: payload.sub,
        cognitoUsername: payload['cognito:username'],
      })
      return null
    }

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    })

    if (!user) {
      try {
        user = await createCloudChatEmbeddedUser({
          p: prisma,
          email: payload.email,
          name: payload.name ?? null,
          emailVerified:
            payload.email_verified === true ? new Date() : null,
        })
        logger.info('JIT-provisioned cloudchat-embedded user', {
          userId: user.id,
          email: user.email,
          hubRole: payload['custom:hub_role'],
          eddieWorkspacesCount: (payload['custom:eddie_workspaces'] ?? '')
            .split(',')
            .filter(Boolean).length,
        })
      } catch (err) {
        if (isPrismaUniqueViolation(err)) {
          user = await prisma.user.findUnique({
            where: { email: payload.email },
          })
          if (!user) throw err
          logger.info('cloudchat-embedded JIT race resolved', {
            email: payload.email,
          })
        } else {
          logger.warn('cloudchat-embedded JIT refused', {
            email: payload.email,
            reason: err instanceof Error ? err.message : 'unknown',
          })
          return null
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      cognitoClaims: {
        'custom:hub_role': payload['custom:hub_role'],
        'custom:eddie_workspaces': payload['custom:eddie_workspaces'],
      },
      cloudChatAuthorization: true,
      cognitoTokenExp: payload.exp,
    }
  } catch (error) {
    logger.error('Error in cloudchat-embedded authorize', { error })
    return null
  }
}
```

## Testing strategy

### Unit — `createCloudChatEmbeddedUser.test.ts`

Vitest. Mock Prisma `user.create` and `trackEvents` via `vi.fn()`. Cases:

- creates `User` row with `email + name + emailVerified + image`
- creates `User` row with `email` only when `name`/`emailVerified` absent
- does not call any workspace, MemberInWorkspace, or apiToken create
- fires single `'User created'` telemetry event with email + first-name
- propagates `prisma.user.create` errors (does not swallow)
- propagates `trackEvents` errors (does not swallow)

### Unit — `cloudchat-embedded.authorize.test.ts`

Vitest. Mocks: `verifyCognitoToken`, `prisma.user.findUnique`,
`createCloudChatEmbeddedUser`, `logger`. Cases:

- returns null when `credentials.token` is missing
- returns null when `verifyCognitoToken` throws (logs error)
- returns null + logs warn when payload has no email
- returns existing user when `findUnique` hits
- creates user via `createCloudChatEmbeddedUser` when `findUnique` misses;
  logs info `'JIT-provisioned cloudchat-embedded user'` with `hubRole` and
  `eddieWorkspacesCount`
- on `P2002` race: refetches and returns user, logs info `'race resolved'`
- on `P2002` race + refetch returns null: rethrows (caught by outer, returns null)
- on non-`P2002` error: logs warn + returns null
- returns full `DatabaseUserWithCognito` shape with `cloudChatAuthorization: true`
- maps `payload.email_verified === true` to `emailVerified: Date`;
  `false`/`undefined` to `emailVerified: null`
- maps `eddie_workspaces: 'ws-a,ws-b'` to `eddieWorkspacesCount: 2`;
  `''` to `0`

### OAuth flow regression coverage

`customAdapter.createUser` is unchanged. Existing coverage (if any) remains valid;
no new tests required for that path.

## Validation plan (local UAT)

No staging environment exists. Local validation in three modes; production
validation via observability.

### Mode 1 — full iframe flow via CloudChat dev login

CloudChat `dev_cognito_token` (in
`cloudchat-saas/app/controllers/devise_overrides/sessions_controller.rb:442`)
emits a fake JWT shaped:

```
header: { alg: 'none', typ: 'JWT' }
payload: { email, sub: 'dev-user', custom:hub_role: 'ADMIN',
           custom:eddie_workspaces: '*', custom:projects: 'claudia_project',
           exp: <1h> }
signature: '' (empty)
```

Eddie's `verifyCognitoToken` decodes payload directly under `NODE_ENV=development`
(no JWKS). End-to-end iframe flow runs in fidelity for everything except claim
shape (`email_verified`, `name` are absent in dev token).

Steps:

```
1. composezao up:  docker compose up -d --build
2. Reset typebot DB:  docker compose exec typebot-builder pnpm prisma migrate reset --force
3. Create fresh CloudChat user (Rails console or super_admin UI):
     User.create!(email: 'jit-uat-001@local.test',
                  uid: 'jit-uat-001@local.test',
                  password: 'devpass',
                  confirmed_at: Time.now)
4. Login at http://localhost:3000 as that user.
5. Navigate Claudia menu → Tools → edit a tool.
6. Confirm Eddie iframe loads (no 'Failed to load flow builder').
7. SQL on typebot DB:
     SELECT id, email, name, "emailVerified" FROM "User"
     WHERE email = 'jit-uat-001@local.test';
   Expected: 1 row, name = NULL, emailVerified = NULL (dev token limitation)
8. SQL — confirm no workspace/token side effects:
     SELECT * FROM "MemberInWorkspace" WHERE "userId" = <id from step 7>;  -- 0 rows
     SELECT * FROM "ApiToken" WHERE "ownerId" = <id from step 7>;          -- 0 rows
9. Logs:  docker compose logs typebot-builder | grep JIT
   Expected: one 'JIT-provisioned cloudchat-embedded user' with userId, email,
   hubRole=ADMIN, eddieWorkspacesCount=1 ('*'.split(',').filter(Boolean) = ['*']).
10. Open second tab as same user → no duplicate row, no extra 'JIT-provisioned'.
```

### Mode 2 — hand-crafted JWT (covers fields the dev token does not produce)

```bash
B64() { echo -n "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }

PAYLOAD='{"email":"jit-uat-002@local.test","email_verified":true,"name":"Maria Cliente","custom:hub_role":"CLIENT","custom:eddie_workspaces":"ws-real-1,ws-real-2","sub":"abc","exp":9999999999}'
JWT="$(B64 '{"alg":"none","typ":"JWT"}').$(B64 "$PAYLOAD")."

# 2a — direct auth callback
curl -i 'http://localhost:3002/api/auth/callback/cloudchat-embedded' \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$JWT\",\"redirect\":false,\"json\":true}"

# 2b — embedded URL (covers SSR + auth + iframe)
xdg-open "http://localhost:3002/typebots?embedded=true&jwt=$JWT"
```

Confirm `emailVerified IS NOT NULL` and `name = 'Maria Cliente'` on the User row.
Confirm log line shows `hubRole: CLIENT` and `eddieWorkspacesCount: 2`.

### Mode 3 — race

```bash
JWT="$(craft-jwt 'race-test@local.test')"
for i in 1 2; do
  curl -X POST 'http://localhost:3002/api/auth/callback/cloudchat-embedded' \
    -H 'Content-Type: application/json' \
    -d "{\"token\":\"$JWT\"}" &
done
wait
```

Confirm exactly one row in `User`, exactly one `'JIT-provisioned'` log line, and
exactly one `'cloudchat-embedded JIT race resolved'` log line.

### Fidelity gap (cannot validate locally)

| Area | Gap | Mitigation |
|---|---|---|
| JWT signature/issuer/audience verification | Local skips JWKS via `NODE_ENV=development` bypass | Out of scope (PR does not modify `verifyCognitoToken`); covered in prod by existing live code path |
| Real Cognito user pool variance | Dev tokens always have `hub_role=ADMIN`, `eddie_workspaces=*` | Mode 2 covers the variant claim shapes |

## Rollout & observability

### Deploy day

Saved Datadog query:

```
service:typebot-builder ("JIT-provisioned" OR "JIT refused" OR "race resolved" OR "payload missing email")
```

Watch for the first 30 minutes after rollout. First successful real-user
`JIT-provisioned` log confirms the prod JWKS path works end-to-end.

### Spot check

```sql
-- typebot prod, post-deploy
SELECT count(*)
FROM "User"
WHERE created_at > '<deploy timestamp>';
```

Compare against count of `'JIT-provisioned cloudchat-embedded user'` log lines —
they should be approximately equal (allowing for OAuth-path users in the gap).

### Ongoing alerts

- Spike in `'cloudchat-embedded JIT refused'` → investigate. Possible causes (oncall triage order):
  1. DB issue — `prisma.user.create` failing for a non-`P2002` reason (connection pool, constraint other than unique-email).
  2. Claim shape change — Cognito payload missing fields the code path expects after passing the email guard.
- Spike in `'cloudchat-embedded telemetry failed (user provisioned)'` → telemetry/Datadog outage. Auth still works; no user-facing impact, but observability is degraded. Out of band of the auth path.
- Sustained ratio of `JIT-provisioned` to total `cloudchat-embedded` auth attempts
  > expected onboarding rate → indicates `findUnique` may be missing existing rows
  (data skew or migration regression).

### Rollback

The PR is purely additive on the embedded path. Reverting restores the
`return null` behavior. Already-provisioned `User` rows stay in the DB and remain
reachable via the same flow on the next deploy. No data migration needed.

## Open questions / future work

- The "Failed to load flow builder. Please reload the page." UI message stays the
  same in every refusal scenario. A future PR could distinguish refusal-by-policy
  vs invalid-token vs internal-error in the UI to improve user feedback. Out of scope here.
- `customAdapter.createUser` and `createCloudChatEmbeddedUser` share a small amount
  of duplication (~8 lines around `user.create` and the `'User created'` telemetry
  event). A future PR could unify if and when a third caller appears. Until then,
  the duplication is preferred over coupling the two paths.
- No rate-limit on the embedded auth path. If JIT provisioning shows abuse signals
  in prod, revisit with the Upstash `Ratelimit` infra already imported in
  `[...nextauth].ts`.
