# GCP OAuth External Migration (Approach 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely transition the Google OAuth integration to allow external emails (External + In Production) on the GCP Console while verifying that the `DISABLE_SIGNUP` security gate is active and correctly blocking unauthorized users.

**Architecture:**
1. Validate the `DISABLE_SIGNUP` code path (programmatically + real Google-login E2E).
2. Modify the GCP OAuth configuration to External + In Production.
3. Collect required Google assets (unlisted YouTube video, domain ownership, public policy) and submit for sensitive-scope verification.

**Tech Stack:** NextAuth.js, Prisma, GCP Console, TSX

---

## Status (updated 2026-06-10)

| Task | Status |
|------|--------|
| 1. Validate `DISABLE_SIGNUP` gate | ✅ Done — script + real Google-login E2E |
| 2. GCP → External + In Production | ⏳ Pending (manual console) — **set prod env first** |
| 3. Verification assets (domain, policy, video) | ⏳ Pending — Sheets read/write already validated locally |
| 4. Submit verification request | ⏳ Pending |

Branch: `feat/gcp-oauth-external-migration`.

---

## Key findings (security & availability)

These were established while validating locally and drive the task details below:

- **The `DISABLE_SIGNUP` PR is env-only — no code change.** The gate is already implemented in two reinforcing places:
  - `apps/builder/src/features/auth/api/customAdapter.ts:30` (adapter `createUser`)
  - `apps/builder/src/pages/api/auth/[...nextauth].ts:326` (`signIn` callback → throws `sign-up-disabled`)
  - Default is `false` (`packages/env/env.ts:71`). Migration only requires setting `DISABLE_SIGNUP=true` (and a correct `ADMIN_EMAIL` allowlist) in the **production** environment.
  - ⚠️ **Risk:** if the prod manifest omits `DISABLE_SIGNUP`, the default `false` means signup is OPEN the moment the app goes External.
- **Embedded CloudChat users are NOT affected by `DISABLE_SIGNUP`.** They authenticate via the `cloudchat-embedded` CredentialsProvider → `cloudchatEmbeddedAuthorize` (verifies the Cognito JWT) → JIT `createCloudChatEmbeddedUser` (direct `p.user.create`, bypasses the adapter gate). It always forwards `createdAt`, so the `signIn` callback's `isNewUser` is `false` and that gate is skipped too. Trust boundary = verified Cognito JWT (`cloudChatAuthorization: true`). So `DISABLE_SIGNUP=true` only locks the **public Google OAuth signup** that External mode newly exposes; embedded SSO logins keep working.
- **Availability — 7-day token expiry in Testing.** While the app's publishing status is **Testing**, refresh tokens for sensitive scopes expire in ~7 days (connections break weekly). This goes away only after **Production + verified**. This is a core reason the migration is needed.
- **Going External + Publish does NOT disconnect existing users/tokens.** New authorizations see the "unverified app" warning screen until verification passes.
- **Scopes come from code, not the console.** `apps/builder/src/pages/api/credentials/google-sheets/consent-url.ts` requests `userinfo.email` + `spreadsheets` + `drive.file` (`access_type=offline`, `prompt=consent`). In **Testing** mode Google does not enforce scope pre-declaration/verification, so test users can grant them directly once the Sheets/Drive **APIs are enabled**. The console "Data access" scope list + justifications only become mandatory for the Production verification submission (Task 4).
- **Two distinct redirect URIs** must be registered on the OAuth client:
  - Login: `${NEXTAUTH_URL}/api/auth/callback/google`
  - Sheets credential: `${NEXTAUTH_URL}/api/credentials/google-sheets/callback`

---

### Task 1: Validate the `DISABLE_SIGNUP` Gate ✅ DONE

**Outcome:** Gate confirmed to block uninvited external users and allow invited/admin ones, both at the adapter level and through the real Google-login flow. Committed on branch (`test: verified DISABLE_SIGNUP logic with local DB script`).

- [x] **Step 1–4: Programmatic verification (adapter level)**
  A throwaway Prisma script (`docs/superpowers/scratch/verify-signup-block.ts`, since deleted) called `customAdapter.createUser` with `DISABLE_SIGNUP=true`:
  - Unauthorized new email → threw `New users are forbidden` ✅
  - Invited email (via a temp `workspaceInvitation`) → created successfully, then cleaned up ✅

  Reference script (for re-running if needed):
  ```typescript
  // docs/superpowers/scratch/verify-signup-block.ts
  import { customAdapter } from '../../../apps/builder/src/features/auth/api/customAdapter'
  import { PrismaClient } from '@typebot.io/prisma'

  process.env.DISABLE_SIGNUP = 'true'
  process.env.ADMIN_EMAIL = 'admin@example.com'

  const prisma = new PrismaClient()
  const adapter = customAdapter(prisma)

  async function runVerification() {
    const randomUnauthorizedEmail = `unauthorized-${Date.now()}@external-domain.com`
    try {
      await adapter.createUser({ email: randomUnauthorizedEmail, emailVerified: null })
      console.error('❌ FAILURE: User creation succeeded but should have been blocked.')
      process.exit(1)
    } catch (err: any) {
      if (err.message !== 'New users are forbidden') { console.error(`❌ unexpected: ${err.message}`); process.exit(1) }
      console.log('✅ Correctly blocked unauthorized new user sign-up.')
    }

    const invitedEmail = `invited-${Date.now()}@external-domain.com`
    const tempWorkspace = await prisma.workspace.create({ data: { name: 'Temp Test Workspace' } })
    const tempInvitation = await prisma.workspaceInvitation.create({
      data: { email: invitedEmail, workspaceId: tempWorkspace.id, role: 'member' },
    })
    try {
      const createdUser = await adapter.createUser({ email: invitedEmail, emailVerified: null })
      console.log(`✅ Created invited user ${createdUser.id}`)
      await prisma.user.delete({ where: { id: createdUser.id } })
    } finally {
      await prisma.workspaceInvitation.delete({ where: { id: tempInvitation.id } })
      await prisma.workspace.delete({ where: { id: tempWorkspace.id } })
    }
    console.log('--- All DISABLE_SIGNUP security checks passed! ---')
    process.exit(0)
  }
  runVerification().catch((e) => { console.error(e); process.exit(1) })
  ```
  Run with: `corepack pnpm@8.15.4 --filter @typebot.io/prisma exec tsx docs/superpowers/scratch/verify-signup-block.ts`

- [x] **Step 5: Real Google-login E2E validation** (2026-06-10)
  With `DISABLE_SIGNUP=true` in local `.env` and the builder restarted, signed in via Google with a fresh external account (`xandylm@gmail.com` — not admin, no invitation). Result: redirected to `/signin?error=sign-up-disabled`, and **0 `User` + 0 `Account` rows** were created (clean block; the `signIn` callback throws before the adapter creates anything).
  > **Gotcha:** the gate only blocks **new** users (`isNewUser`). An account that already exists in the DB is not blocked. To re-test the block, use an account that has never signed in, or delete its `User` row first.

---

### Task 2: GCP OAuth Consent Screen Transition (Console Steps)

- [ ] **Step 1: Set production environment variables (the "DISABLE_SIGNUP PR")**
  This is an **env/config change, not code** (see Key findings). In the production deployment of the typebot **builder** (manifest lives in the infra repo, not in composezao):
  - Set `DISABLE_SIGNUP=true`
  - Confirm `ADMIN_EMAIL` lists the emails that should bypass the gate
  - Deploy/restart so the builder reloads env at boot (env is read at startup, not hot-reloaded)
  - ⚠️ Do this **before** publishing the app as External, so external signup is locked the instant the consent screen opens up.

- [ ] **Step 2: Register/confirm OAuth redirect URIs**
  On the OAuth client, ensure both redirect URIs are present for the production host:
  - `${NEXTAUTH_URL}/api/auth/callback/google`
  - `${NEXTAUTH_URL}/api/credentials/google-sheets/callback`

- [ ] **Step 3: Transition GCP User Type to External**
  1. Open the [Google Cloud Console](https://console.cloud.google.com/).
  2. **APIs & Services** > **OAuth Consent Screen** > **Edit App**.
  3. Set User Type to **External**.
  4. Fill in App Name, User Support Email, Developer Contact Information.
  5. Save and Continue.

- [ ] **Step 4: Push OAuth Consent Screen to In Production**
  1. Under the OAuth Consent Screen dashboard, locate **Publishing status**.
  2. Click **Publish App**.
  3. Accept the warning that the app becomes available to any Google user (shows "Unverified App" until verified). Existing users/tokens are not disconnected.

---

### Task 3: Setup Verification Assets

- [ ] **Step 1: Verify Domain Ownership**
  Ensure the domain used for authorization (e.g. `cloudhumans.com` or `cloudhumans.io`) is verified in the Google Search Console of the GCP account owner. Note: the builder runs on `eddie.us-east-1.prd.cloudhumans.io` (`.io`) while the brand domain is likely `cloudhumans.com` — both (or a standardized homepage + privacy + redirect on one domain) must be verified. This is usually the highest-friction step.

- [ ] **Step 2: Host Privacy Policy and Public Homepage**
  On the verified domain, publicly accessible (no login):
  - Homepage: describes the integration/app purpose.
  - Privacy Policy: compliant with the Google API Services User Data Policy (incl. Limited Use), explaining how `spreadsheets` and `drive.file` scope data is accessed/stored/processed.

- [ ] **Step 3: Record Demo Video**
  Unlisted YouTube video showing the authorization flow. Must show:
  1. The user initiating the OAuth flow from Typebot.
  2. The Google OAuth Consent Screen with the **Client ID** clearly visible in the browser URL bar.
  3. The user completing authorization.
  4. Reading/writing to a Google Sheet block within a chatbot flow.
  > **Already validated locally (2026-06-10):** the consent flow requests `spreadsheets` + `drive.file` and read/write to a real sheet works — this is the dry run for the video.

---

### Task 4: Submit Verification Request on GCP Console

- [ ] **Step 1: Justification for Scopes**
  In the GCP Consent Screen "Data access" workflow, add justifications:
  - `https://www.googleapis.com/auth/spreadsheets`: "Users need to connect existing spreadsheets that were not created by the app to read and write row data in their custom chatbot workflows."
  - `https://www.googleapis.com/auth/drive.file`: "Required to create new sheets or access files chosen specifically by the user."

- [ ] **Step 2: Submit to Verification Center**
  Provide links to the demo video, privacy policy, and homepage, and submit for verification. After approval, the unverified-app warning disappears and sensitive-scope refresh tokens stop expiring at 7 days.
