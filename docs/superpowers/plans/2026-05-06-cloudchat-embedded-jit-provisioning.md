# CloudChat-Embedded JIT User Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the typebot `User` row just-in-time when a valid CloudChat Cognito JWT is presented in the embedded auth flow, eliminating the "Failed to load flow builder. Please reload the page." error on first-time CloudChat embed.

**Architecture:** Pure-additive on the `cloudchat-embedded` NextAuth provider path. The OAuth flow (`customAdapter.createUser`) and `verifyCognitoToken` stay byte-for-byte unchanged. Two new tiny helpers (`isPrismaUniqueViolation`, `createCloudChatEmbeddedUser`), one extracted authorize function (`cloudchatEmbeddedAuthorize`) for testability, and a wiring change in `[...nextauth].ts`.

**Tech Stack:** TypeScript, Next.js (NextAuth `CredentialsProvider`), Prisma 5.12, Vitest 4.1 (matches `accessControl.test.ts` convention), pnpm + turbo monorepo.

**Source spec:** `docs/superpowers/specs/2026-05-06-cloudchat-embedded-jit-provisioning-design.md` (PR #193).

**Working branch:** `feat/cloudchat-embedded-jit-provisioning` (already exists; spec doc commit on top).

---

## Prerequisites (one-time per machine)

Run before starting Task 1:

```bash
# from typebot.io root
pnpm install
pnpm --filter @typebot.io/prisma db:generate

# Confirm vitest can find prisma client by running an existing test
cd apps/builder
npx vitest@4.1.5 run src/features/workspace/helpers/accessControl.test.ts --reporter=verbose
# Expected: PASS (existing repo test).
# If it errors with "Cannot find module '.prisma/client/default'", re-run db:generate.
```

The `.env` at typebot.io root must have `COGNITO_ISSUER_URL` and `CLOUDCHAT_COGNITO_APP_CLIENT_ID` populated. Values are in `.env.dev.example`. The husky pre-commit hook (`pnpm lint && pnpm format:check`) reads them via `next lint`.

---

## File Structure

```
apps/builder/src/features/auth/helpers/
  isPrismaUniqueViolation.ts            (NEW, Task 1)
  isPrismaUniqueViolation.test.ts       (NEW, Task 1)
  createCloudChatEmbeddedUser.ts        (NEW, Task 2)
  createCloudChatEmbeddedUser.test.ts   (NEW, Task 2)
  cloudchatEmbeddedAuthorize.ts         (NEW, Task 3)
  cloudchatEmbeddedAuthorize.test.ts    (NEW, Task 3)

apps/builder/src/pages/api/auth/
  [...nextauth].ts                      (MODIFY, Task 4 — replace inline authorize block)
```

**Boundaries:**
- `isPrismaUniqueViolation` — generic Prisma `P2002` guard. Pure function, no side effects.
- `createCloudChatEmbeddedUser` — minimal `User` row creation + `'User created'` telemetry. Takes `p` as DI for testability.
- `cloudchatEmbeddedAuthorize` — full `authorize` callback for the `cloudchat-embedded` provider, with all JIT logic, race handling, and logging. Takes `p` as DI.
- `[...nextauth].ts` — provider wiring only; no inline business logic.

**Why extract the authorize function (vs in-place edit per spec):** the spec says "modify in place," but extraction is the only way to unit-test the callback without instantiating the entire NextAuth handler. The behavior the spec describes is preserved exactly; only the location changes.

---

## Task 1: isPrismaUniqueViolation guard

**Files:**
- Create: `apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.ts`
- Test: `apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import { isPrismaUniqueViolation } from './isPrismaUniqueViolation'

describe('isPrismaUniqueViolation', () => {
  it('returns true for PrismaClientKnownRequestError with code P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    expect(isPrismaUniqueViolation(err)).toBe(true)
  })

  it('returns false for PrismaClientKnownRequestError with non-P2002 codes', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '5.12.1' }
    )
    expect(isPrismaUniqueViolation(err)).toBe(false)
  })

  it('returns false for a plain Error instance', () => {
    expect(isPrismaUniqueViolation(new Error('boom'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isPrismaUniqueViolation(null)).toBe(false)
    expect(isPrismaUniqueViolation(undefined)).toBe(false)
    expect(isPrismaUniqueViolation('string')).toBe(false)
    expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(false)
    expect(isPrismaUniqueViolation(42)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/isPrismaUniqueViolation.test.ts --reporter=verbose
```

Expected: FAIL with module-not-found error referencing `./isPrismaUniqueViolation`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.ts`:

```ts
import { Prisma } from '@typebot.io/prisma'

export const isPrismaUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/isPrismaUniqueViolation.test.ts --reporter=verbose
```

Expected: PASS — 4 tests, all green.

- [ ] **Step 5: Run lint to verify the guard satisfies the project style**

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
pnpm lint
```

Expected: `✔ No ESLint warnings or errors` for the builder package.

- [ ] **Step 6: Commit and push**

```bash
git add apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.ts \
        apps/builder/src/features/auth/helpers/isPrismaUniqueViolation.test.ts
git -c commit.gpgsign=false commit -m ":sparkles: feat(auth): add isPrismaUniqueViolation guard"
git push
```

---

## Task 2: createCloudChatEmbeddedUser helper

**Files:**
- Create: `apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.ts`
- Test: `apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts`:

```ts
import { vi } from 'vitest'

vi.mock('@typebot.io/telemetry/trackEvents', () => ({
  trackEvents: vi.fn(),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { trackEvents } from '@typebot.io/telemetry/trackEvents'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'

const trackEventsMock = trackEvents as ReturnType<typeof vi.fn>

const buildPrismaMock = (overrides?: { create?: ReturnType<typeof vi.fn> }) => {
  const create =
    overrides?.create ??
    vi.fn(async ({ data }) => ({
      id: 'user-fixture-id',
      email: data.email,
      name: data.name ?? null,
      emailVerified: data.emailVerified ?? null,
      image: data.image ?? null,
      onboardingCategories: data.onboardingCategories ?? [],
      createdAt: new Date('2026-05-06T00:00:00Z'),
      updatedAt: new Date('2026-05-06T00:00:00Z'),
    }))
  return {
    user: { create },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('createCloudChatEmbeddedUser', () => {
  beforeEach(() => {
    trackEventsMock.mockReset()
    trackEventsMock.mockResolvedValue(undefined)
  })

  it('creates a User row with email + name + emailVerified + image', async () => {
    const p = buildPrismaMock()
    const verifiedAt = new Date('2026-05-06T00:00:00Z')
    const user = await createCloudChatEmbeddedUser({
      p,
      email: 'maria@cliente.com',
      name: 'Maria Cliente',
      emailVerified: verifiedAt,
      image: null,
    })

    expect(p.user.create).toHaveBeenCalledTimes(1)
    expect(p.user.create).toHaveBeenCalledWith({
      data: {
        email: 'maria@cliente.com',
        name: 'Maria Cliente',
        emailVerified: verifiedAt,
        image: null,
        onboardingCategories: [],
      },
    })
    expect(user.email).toBe('maria@cliente.com')
  })

  it('creates a User row with email only when name and emailVerified absent', async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'minimal@local.test' })

    expect(p.user.create).toHaveBeenCalledWith({
      data: {
        email: 'minimal@local.test',
        name: undefined,
        emailVerified: undefined,
        image: undefined,
        onboardingCategories: [],
      },
    })
  })

  it('does not create workspace, MemberInWorkspace or apiToken (no nested relations)', async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'no-side@local.test' })

    const callArg = p.user.create.mock.calls[0][0]
    expect(callArg.data).not.toHaveProperty('apiTokens')
    expect(callArg.data).not.toHaveProperty('workspaces')
    expect(callArg).not.toHaveProperty('include')
  })

  it("fires a single 'User created' telemetry event with email and first-name", async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({
      p,
      email: 'two-words@local.test',
      name: 'João da Silva',
    })

    expect(trackEventsMock).toHaveBeenCalledTimes(1)
    expect(trackEventsMock).toHaveBeenCalledWith([
      {
        name: 'User created',
        userId: 'user-fixture-id',
        data: { email: 'two-words@local.test', name: 'João' },
      },
    ])
  })

  it("emits telemetry with name=undefined when name is null/absent", async () => {
    const p = buildPrismaMock()
    await createCloudChatEmbeddedUser({ p, email: 'no-name@local.test' })

    expect(trackEventsMock).toHaveBeenCalledWith([
      {
        name: 'User created',
        userId: 'user-fixture-id',
        data: { email: 'no-name@local.test', name: undefined },
      },
    ])
  })

  it('propagates prisma.user.create errors (does not swallow)', async () => {
    const create = vi.fn(async () => {
      throw new Error('db connection lost')
    })
    const p = buildPrismaMock({ create })

    await expect(
      createCloudChatEmbeddedUser({ p, email: 'boom@local.test' })
    ).rejects.toThrow('db connection lost')
    expect(trackEventsMock).not.toHaveBeenCalled()
  })

  it('propagates trackEvents errors (does not swallow)', async () => {
    trackEventsMock.mockRejectedValueOnce(new Error('telemetry endpoint down'))
    const p = buildPrismaMock()

    await expect(
      createCloudChatEmbeddedUser({ p, email: 'tele@local.test' })
    ).rejects.toThrow('telemetry endpoint down')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts --reporter=verbose
```

Expected: FAIL with module-not-found error referencing `./createCloudChatEmbeddedUser`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.ts`:

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
    data: {
      email,
      name: name ?? undefined,
      emailVerified: emailVerified ?? undefined,
      image: image ?? undefined,
      onboardingCategories: [],
    },
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

Note the `?? undefined` coercion: Prisma's `user.create` types reject `null` for `String?` columns when constructed inline, but accept `undefined`. The test checks `data: { ..., name: undefined, ... }` to match.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts --reporter=verbose
```

Expected: PASS — 7 tests, all green.

- [ ] **Step 5: Run lint**

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
pnpm lint
```

Expected: no warnings or errors.

- [ ] **Step 6: Commit and push**

```bash
git add apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.ts \
        apps/builder/src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts
git -c commit.gpgsign=false commit -m ":sparkles: feat(auth): add createCloudChatEmbeddedUser helper"
git push
```

---

## Task 3: cloudchatEmbeddedAuthorize extracted function (with JIT logic)

**Files:**
- Create: `apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.ts`
- Test: `apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts`

This task extracts the entire `authorize` callback for `cloudchat-embedded` into a standalone function and adds the full JIT logic from the spec.

- [ ] **Step 1: Write the failing test**

Create `apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts`:

```ts
import { vi } from 'vitest'

vi.mock('@typebot.io/env', () => ({
  env: {
    COGNITO_ISSUER_URL: 'https://cognito.test/issuer',
    CLOUDCHAT_COGNITO_APP_CLIENT_ID: 'test-client-id',
  },
}))

vi.mock('@/helpers/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/auth/helpers/verifyCognitoToken', () => ({
  verifyCognitoToken: vi.fn(),
}))

vi.mock('./createCloudChatEmbeddedUser', () => ({
  createCloudChatEmbeddedUser: vi.fn(),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { Prisma } from '@typebot.io/prisma'
import logger from '@/helpers/logger'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'
import { cloudchatEmbeddedAuthorize } from './cloudchatEmbeddedAuthorize'

const verifyMock = verifyCognitoToken as ReturnType<typeof vi.fn>
const createMock = createCloudChatEmbeddedUser as ReturnType<typeof vi.fn>
const loggerInfo = (logger.info as unknown) as ReturnType<typeof vi.fn>
const loggerWarn = (logger.warn as unknown) as ReturnType<typeof vi.fn>
const loggerError = (logger.error as unknown) as ReturnType<typeof vi.fn>

const userFixture = {
  id: 'user-1',
  email: 'jit@local.test',
  name: 'JIT',
  image: null,
  emailVerified: new Date('2026-05-06T00:00:00Z'),
}

const buildPrismaMock = (
  findUniqueImpl?: ReturnType<typeof vi.fn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  user: {
    findUnique: findUniqueImpl ?? vi.fn(async () => null),
  },
})

const basePayload = {
  email: 'jit@local.test',
  email_verified: true,
  name: 'JIT',
  'custom:hub_role': 'CLIENT',
  'custom:eddie_workspaces': 'ws-a,ws-b',
  sub: 'sub-1',
  exp: 9999999999,
}

describe('cloudchatEmbeddedAuthorize', () => {
  beforeEach(() => {
    verifyMock.mockReset()
    createMock.mockReset()
    loggerInfo.mockReset()
    loggerWarn.mockReset()
    loggerError.mockReset()
  })

  it('returns null when credentials.token is missing', async () => {
    const p = buildPrismaMock()
    const result = await cloudchatEmbeddedAuthorize(p, undefined)
    expect(result).toBeNull()
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('returns null and logs error when verifyCognitoToken throws', async () => {
    verifyMock.mockRejectedValueOnce(new Error('bad signature'))
    const p = buildPrismaMock()

    const result = await cloudchatEmbeddedAuthorize(p, { token: 'bad' })

    expect(result).toBeNull()
    expect(loggerError).toHaveBeenCalledWith(
      'Error in cloudchat-embedded authorize',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('returns null and logs warn when payload has no email', async () => {
    verifyMock.mockResolvedValueOnce({ sub: 'sub-x', 'cognito:username': 'u' })
    const p = buildPrismaMock()

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith(
      'cloudchat-embedded payload missing email',
      { sub: 'sub-x', cognitoUsername: 'u' }
    )
    expect(p.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns existing user when findUnique hits (does not call createCloudChatEmbeddedUser)', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'jit@local.test' },
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'jit@local.test',
      cloudChatAuthorization: true,
    })
  })

  it("creates user via createCloudChatEmbeddedUser and logs info 'JIT-provisioned'", async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockResolvedValueOnce(userFixture)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(createMock).toHaveBeenCalledWith({
      p,
      email: 'jit@local.test',
      name: 'JIT',
      emailVerified: expect.any(Date),
    })
    expect(loggerInfo).toHaveBeenCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      {
        userId: 'user-1',
        email: 'jit@local.test',
        hubRole: 'CLIENT',
        eddieWorkspacesCount: 2,
      }
    )
    expect(result).not.toBeNull()
  })

  it("on P2002: refetches and returns user, logs info 'race resolved'", async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null) // first call (before create)
      .mockResolvedValueOnce(userFixture) // refetch after P2002
    const p = buildPrismaMock(findUnique)

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    createMock.mockRejectedValueOnce(p2002)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(findUnique).toHaveBeenCalledTimes(2)
    expect(loggerInfo).toHaveBeenCalledWith(
      'cloudchat-embedded JIT race resolved',
      { email: 'jit@local.test' }
    )
    expect(result).toMatchObject({ id: 'user-1' })
  })

  it('on P2002 + refetch returns null: rethrows (caught by outer, returns null + error log)', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null) // refetch also null — pathological
    const p = buildPrismaMock(findUnique)

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.12.1' }
    )
    createMock.mockRejectedValueOnce(p2002)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerError).toHaveBeenCalledWith(
      'Error in cloudchat-embedded authorize',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('on non-P2002 error: logs warn JIT refused + returns null', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => null)
    const p = buildPrismaMock(findUnique)
    createMock.mockRejectedValueOnce(new Error('telemetry endpoint down'))

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith('cloudchat-embedded JIT refused', {
      email: 'jit@local.test',
      reason: 'telemetry endpoint down',
    })
    expect(loggerError).not.toHaveBeenCalled()
  })

  it('returns full DatabaseUserWithCognito shape with cloudChatAuthorization=true and cognitoTokenExp', async () => {
    verifyMock.mockResolvedValueOnce(basePayload)
    const findUnique = vi.fn(async () => userFixture)
    const p = buildPrismaMock(findUnique)

    const result = await cloudchatEmbeddedAuthorize(p, { token: 't' })

    expect(result).toEqual({
      id: 'user-1',
      email: 'jit@local.test',
      name: 'JIT',
      image: null,
      emailVerified: userFixture.emailVerified,
      cognitoClaims: {
        'custom:hub_role': 'CLIENT',
        'custom:eddie_workspaces': 'ws-a,ws-b',
      },
      cloudChatAuthorization: true,
      cognitoTokenExp: 9999999999,
    })
  })

  it('maps email_verified=true to emailVerified Date; false/undefined to null', async () => {
    // Case: email_verified === true
    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email_verified: true,
    })
    const p1 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p1, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: expect.any(Date) })
    )

    // Case: email_verified === false
    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'a@b',
      email_verified: false,
    })
    const p2 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p2, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: null })
    )

    // Case: email_verified absent
    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'c@d',
      email_verified: undefined,
    })
    const p3 = buildPrismaMock(vi.fn(async () => null))
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(p3, { token: 't' })
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailVerified: null })
    )
  })

  it("counts eddie_workspaces correctly: 'ws-a,ws-b' = 2; '' = 0; '*' = 1", async () => {
    const findUnique = vi.fn(async () => null)

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      'custom:eddie_workspaces': 'ws-a,ws-b',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), { token: 't' })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 2 })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'b@b',
      'custom:eddie_workspaces': '',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), { token: 't' })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 0 })
    )

    verifyMock.mockResolvedValueOnce({
      ...basePayload,
      email: 'c@c',
      'custom:eddie_workspaces': '*',
    })
    createMock.mockResolvedValueOnce(userFixture)
    await cloudchatEmbeddedAuthorize(buildPrismaMock(findUnique), { token: 't' })
    expect(loggerInfo).toHaveBeenLastCalledWith(
      'JIT-provisioned cloudchat-embedded user',
      expect.objectContaining({ eddieWorkspacesCount: 1 })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts --reporter=verbose
```

Expected: FAIL with module-not-found error referencing `./cloudchatEmbeddedAuthorize`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.ts`:

```ts
import { PrismaClient } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'
import logger from '@/helpers/logger'
import { verifyCognitoToken } from '@/features/auth/helpers/verifyCognitoToken'
import { DatabaseUserWithCognito } from '@/features/auth/types/cognito'
import { isPrismaUniqueViolation } from './isPrismaUniqueViolation'
import { createCloudChatEmbeddedUser } from './createCloudChatEmbeddedUser'

type Credentials = { token?: string } | undefined

type AuthorizedUser = Pick<
  DatabaseUserWithCognito,
  | 'id'
  | 'name'
  | 'email'
  | 'image'
  | 'emailVerified'
  | 'cognitoClaims'
  | 'cloudChatAuthorization'
  | 'cognitoTokenExp'
>

export const cloudchatEmbeddedAuthorize = async (
  p: PrismaClient,
  credentials: Credentials
): Promise<AuthorizedUser | null> => {
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

    let user = await p.user.findUnique({
      where: { email: payload.email },
    })

    if (!user) {
      try {
        user = await createCloudChatEmbeddedUser({
          p,
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
          user = await p.user.findUnique({
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/builder
npx vitest@4.1.5 run src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts --reporter=verbose
```

Expected: PASS — 11 tests, all green.

- [ ] **Step 5: Run lint**

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
pnpm lint
```

Expected: no warnings or errors.

- [ ] **Step 6: Commit and push**

```bash
git add apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.ts \
        apps/builder/src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts
git -c commit.gpgsign=false commit -m ":sparkles: feat(auth): cloudchat-embedded JIT user provisioning"
git push
```

---

## Task 4: Wire cloudchatEmbeddedAuthorize into [...nextauth].ts

This is a no-logic-change wiring task. The inline `authorize` block at lines 162-207 of `[...nextauth].ts` is replaced with a single line referencing the new helper. Behavior is preserved (covered by Task 3 tests).

**Files:**
- Modify: `apps/builder/src/pages/api/auth/[...nextauth].ts`

- [ ] **Step 1: Read current state of the cloudchat-embedded provider block**

Inspect the current file to confirm line numbers before editing:

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
sed -n '154,210p' apps/builder/src/pages/api/auth/[...nextauth].ts
```

Expected: the block starts with `// Add CloudChat embedded provider` and ends after `)` closing `providers.push(`.

- [ ] **Step 2: Replace the inline authorize block**

In `apps/builder/src/pages/api/auth/[...nextauth].ts`, replace the entire `providers.push(...)` block for `cloudchat-embedded` (lines 154-209 in the original file) with:

```ts
// Add CloudChat embedded provider (using credentials provider)
providers.push(
  CredentialsProvider({
    id: 'cloudchat-embedded',
    name: 'CloudChat Embedded',
    credentials: {
      token: { label: 'Token', type: 'text' },
    },
    authorize: (credentials) =>
      cloudchatEmbeddedAuthorize(prisma, credentials ?? undefined),
  })
)
```

- [ ] **Step 3: Add the import for `cloudchatEmbeddedAuthorize`**

Find the existing imports near the top of the file (around lines 13-35) and add this import alongside the other `@/features/auth/helpers/*` imports:

```ts
import { cloudchatEmbeddedAuthorize } from '@/features/auth/helpers/cloudchatEmbeddedAuthorize'
```

- [ ] **Step 4: Remove now-unused imports**

The `verifyCognitoToken` import (line ~36) is no longer used directly in `[...nextauth].ts` after extraction. Search the file for other usages first:

```bash
grep -n 'verifyCognitoToken' apps/builder/src/pages/api/auth/[...nextauth].ts
```

If the only line referencing `verifyCognitoToken` is the import statement itself, remove that import. If anything else uses it, keep the import.

`DatabaseUserWithCognito` is still used elsewhere in the file (jwt callback line ~298, 301) — keep this import.

- [ ] **Step 5: Run lint to catch broken imports or formatting**

```bash
pnpm lint
```

Expected: no warnings or errors. If lint flags an unused import, remove it.

- [ ] **Step 6: Run all unit tests we added so far to confirm nothing regressed**

```bash
cd apps/builder
npx vitest@4.1.5 run \
  src/features/auth/helpers/isPrismaUniqueViolation.test.ts \
  src/features/auth/helpers/createCloudChatEmbeddedUser.test.ts \
  src/features/auth/helpers/cloudchatEmbeddedAuthorize.test.ts \
  --reporter=verbose
```

Expected: all suites green (4 + 7 + 11 = 22 tests).

- [ ] **Step 7: Type-check the builder app**

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
pnpm --filter builder exec tsc --noEmit
```

Expected: no type errors. (If your local tsc command differs, follow the project's existing convention. Husky pre-commit only checks lint+format, but a stray type error from the import shuffle can break CI Docker builds.)

- [ ] **Step 8: Commit and push**

```bash
git add apps/builder/src/pages/api/auth/[...nextauth].ts
git -c commit.gpgsign=false commit -m ":recycle: refactor(auth): wire cloudchatEmbeddedAuthorize into nextauth"
git push
```

---

## Task 5: Run UAT and finalize PR

This task has no commits. It runs the local UAT documented in the spec (Section "Validation plan (local UAT)") and flips the PR from draft to ready-for-review.

- [ ] **Step 1: Compose stack up**

```bash
cd /home/fabio/workspace/composezao-da-massa
docker compose up -d --build cloudchat-saas typebot-builder typebot-viewer typebot-postgres claudia-app
```

Wait until all containers report healthy (`docker compose ps`).

- [ ] **Step 2: Reset typebot DB**

```bash
docker compose exec typebot-builder pnpm prisma migrate reset --force --schema /app/packages/prisma/postgresql/schema.prisma
```

Expected: DB recreated, migrations applied. (If the container path differs, run from the host: `cd typebot.io/packages/prisma && pnpm db:migrate`.)

- [ ] **Step 3: UAT Mode 1 — full iframe flow via CloudChat dev login**

```bash
# Open Rails console in CloudChat container
docker compose exec cloudchat-saas bundle exec rails console
```

Inside the console:

```ruby
User.create!(
  email: 'jit-uat-001@local.test',
  uid: 'jit-uat-001@local.test',
  password: 'devpass123',
  password_confirmation: 'devpass123',
  confirmed_at: Time.now
)
exit
```

Then:

1. Open `http://localhost:3000` in browser. Login as `jit-uat-001@local.test` / `devpass123`.
2. Navigate Claudia menu → Tools → click to edit any tool.
3. Confirm the Eddie iframe loads (no "Failed to load flow builder" message).
4. Verify in DB:

```bash
docker compose exec typebot-postgres psql -U postgres -d typebot -c \
  "SELECT id, email, name, \"emailVerified\" FROM \"User\" WHERE email = 'jit-uat-001@local.test';"
```

Expected: 1 row, `name=NULL`, `emailVerified=NULL` (dev token has no `email_verified` or `name` claim — limitation of the CloudChat dev shortcut, not the JIT logic).

5. Verify NO workspace/token side effects:

```bash
docker compose exec typebot-postgres psql -U postgres -d typebot -c \
  "SELECT m.\"workspaceId\", m.role FROM \"MemberInWorkspace\" m
   JOIN \"User\" u ON u.id = m.\"userId\"
   WHERE u.email = 'jit-uat-001@local.test';"
docker compose exec typebot-postgres psql -U postgres -d typebot -c \
  "SELECT id, name FROM \"ApiToken\" o
   JOIN \"User\" u ON u.id = o.\"ownerId\"
   WHERE u.email = 'jit-uat-001@local.test';"
```

Expected: 0 rows in both queries.

6. Verify log:

```bash
docker compose logs typebot-builder --since=5m | grep -E 'JIT-provisioned|JIT refused|race resolved|payload missing email'
```

Expected: exactly one `'JIT-provisioned cloudchat-embedded user'` line with `userId, email, hubRole=ADMIN, eddieWorkspacesCount=1`.

- [ ] **Step 4: UAT Mode 2 — hand-crafted JWT (covers email_verified + name + non-ADMIN role)**

```bash
B64() { echo -n "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
PAYLOAD='{"email":"jit-uat-002@local.test","email_verified":true,"name":"Maria Cliente","custom:hub_role":"CLIENT","custom:eddie_workspaces":"ws-real-1,ws-real-2","sub":"abc","exp":9999999999}'
JWT="$(B64 '{"alg":"none","typ":"JWT"}').$(B64 "$PAYLOAD")."

# Get NextAuth CSRF token (cookie + body)
CSRF_RESP=$(curl -sc /tmp/jit-uat-cookies.txt 'http://localhost:3002/api/auth/csrf')
CSRF_TOKEN=$(echo "$CSRF_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['csrfToken'])")

# Hit the cloudchat-embedded callback
curl -i -b /tmp/jit-uat-cookies.txt 'http://localhost:3002/api/auth/callback/cloudchat-embedded' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF_TOKEN" \
  --data-urlencode "token=$JWT" \
  --data-urlencode "json=true"
```

Expected: HTTP 200 or 302 (NextAuth typically responds with redirect for credentials sign-in).

Verify in DB:

```bash
docker compose exec typebot-postgres psql -U postgres -d typebot -c \
  "SELECT id, email, name, \"emailVerified\" FROM \"User\" WHERE email = 'jit-uat-002@local.test';"
```

Expected: 1 row, `name='Maria Cliente'`, `emailVerified` populated with a recent timestamp.

Verify log:

```bash
docker compose logs typebot-builder --since=5m | grep 'jit-uat-002'
```

Expected: `'JIT-provisioned cloudchat-embedded user'` with `hubRole: 'CLIENT'`, `eddieWorkspacesCount: 2`.

- [ ] **Step 5: UAT Mode 3 — race condition**

```bash
RACE_PAYLOAD='{"email":"jit-uat-race@local.test","email_verified":true,"sub":"race","exp":9999999999}'
RACE_JWT="$(B64 '{"alg":"none","typ":"JWT"}').$(B64 "$RACE_PAYLOAD")."

# Fresh CSRF
CSRF_RESP=$(curl -sc /tmp/jit-race-cookies.txt 'http://localhost:3002/api/auth/csrf')
CSRF_TOKEN=$(echo "$CSRF_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['csrfToken'])")

# Two concurrent callbacks
for i in 1 2; do
  curl -s -b /tmp/jit-race-cookies.txt 'http://localhost:3002/api/auth/callback/cloudchat-embedded' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=$CSRF_TOKEN" \
    --data-urlencode "token=$RACE_JWT" \
    --data-urlencode "json=true" \
    > /tmp/jit-race-$i.out 2>&1 &
done
wait
```

Verify in DB:

```bash
docker compose exec typebot-postgres psql -U postgres -d typebot -c \
  "SELECT count(*) FROM \"User\" WHERE email = 'jit-uat-race@local.test';"
```

Expected: 1 (single row).

Verify log:

```bash
docker compose logs typebot-builder --since=2m | grep -E 'jit-uat-race|race resolved'
```

Expected: exactly one `'JIT-provisioned cloudchat-embedded user'` and exactly one `'cloudchat-embedded JIT race resolved'` log line. (If the timing of the two requests means they didn't actually race, the second log may be absent — re-run the curls a couple of times until the race fires.)

- [ ] **Step 6: Mark PR as ready-for-review and post UAT result**

```bash
cd /home/fabio/workspace/composezao-da-massa/typebot.io
gh pr ready 193

# Post a comment with the UAT outcome
gh pr comment 193 --body "$(cat <<'EOF'
## Local UAT — passed

- Mode 1 (CloudChat dev iframe): user JIT-provisioned, no Workspace/MemberInWorkspace/ApiToken side effects, single 'JIT-provisioned' log entry.
- Mode 2 (hand-crafted JWT): emailVerified populated, name = 'Maria Cliente', hubRole=CLIENT, eddieWorkspacesCount=2 logged.
- Mode 3 (race): single User row, one 'JIT-provisioned' + one 'race resolved' log entry.

OAuth flow regression check: customAdapter.createUser was not modified; no changes to that path.
EOF
)"
```

---

## Self-review

### Spec coverage
- "Add `createCloudChatEmbeddedUser`" → Task 2.
- "Add `isPrismaUniqueViolation` guard" → Task 1.
- "Modify `cloudchat-embedded.authorize`" → Task 3 (function body) + Task 4 (wiring).
- "Vitest unit on helper" → Task 2 tests.
- "Vitest unit on authorize" → Task 3 tests.
- "Local UAT in 3 modes" → Task 5.
- "Don't touch customAdapter" → respected in every task; Task 4 explicitly only modifies `[...nextauth].ts`.
- "Don't touch verifyCognitoToken" → respected; Task 4 only removes the import if unused.

### Placeholder scan
- No "TBD", "TODO", "implement later", or vague "add error handling" steps.
- Every code block contains the actual implementation.
- Every test has a real assertion list.
- Commands include exact paths and expected outputs.

### Type / signature consistency
- `createCloudChatEmbeddedUser({ p, email, name, emailVerified, image })` — same shape used in Task 2 implementation, Task 2 test, and Task 3 implementation calls.
- `cloudchatEmbeddedAuthorize(p, credentials)` — same signature in Task 3 implementation, Task 3 tests, and Task 4 wiring (`authorize: (credentials) => cloudchatEmbeddedAuthorize(prisma, credentials ?? undefined)`).
- `isPrismaUniqueViolation(e: unknown)` — same in Task 1 implementation and Task 3 tests' P2002 case.

### Open follow-ups (intentionally out of scope)
- The dev `npx vitest@4.1.5 run` command depends on on-demand vitest install (no project devDep). Matches the existing convention from `accessControl.test.ts`. If a future PR adds vitest as a real devDep + a `test:unit` script, these tests run via `pnpm test:unit` automatically.
- Production deployment validation is done via the Datadog observability plan documented in the spec, not in this implementation plan.
