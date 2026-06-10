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
| 2. Set `DISABLE_SIGNUP=true` in prod env | 🔄 PR open — [typebot.io-manifests#80](https://github.com/cloudhumans/typebot.io-manifests/pull/80) (must merge + deploy before External) |
| 3. Prep assets in parallel (Block A — can start now) | ⏳ Pending — domain verify · public homepage + privacy policy · consent-screen branding |
| 4. GCP → External + In Production | ⏳ Pending (manual console) — after PR #80 lands |
| 5. Demo video + submit verification | ⏳ Pending — Sheets read/write already validated locally |

Branch: `feat/gcp-oauth-external-migration`.

**Sequencing:** Block A (Task 3 — domain, homepage/privacy, branding) is independent of publishing status and can be done **now, in parallel**, with zero impact on the running Internal app. It's the slow part (Google review), so start early. Flipping to External (Task 4) is gated only on PR #80 being deployed.

---

## Key findings (security & availability)

These were established while validating locally and drive the task details below:

- **The `DISABLE_SIGNUP` PR is env-only — no code change.** The gate exists in two spots, but **only the `signIn` callback is effective with our config** (`ADMIN_EMAIL` unset):
  - `apps/builder/src/pages/api/auth/[...nextauth].ts:326` (`signIn` callback → throws `sign-up-disabled`). Uses `!env.ADMIN_EMAIL?.includes(email)`, which is `true` when `ADMIN_EMAIL` is unset → **gate fires**. ✅
  - `apps/builder/src/features/auth/api/customAdapter.ts:30` (adapter `createUser`). Uses `env.ADMIN_EMAIL?.every(...)`, which short-circuits to `undefined` (falsy) when `ADMIN_EMAIL` is unset → **adapter check is a no-op**. ⚠️ So it is NOT a second line of defense in our config. It's also moot for interactive logins: the `signIn` callback throws first, before `createUser` is reached.
  - Safe because no app code calls `adapter.createUser` outside the NextAuth `signIn`-gated flow (verified by grep); the only non-`signIn` user creation is embedded (`createCloudChatEmbeddedUser`), an intentional bypass. Latent upstream quirk worth noting: the adapter gate silently disables itself whenever `ADMIN_EMAIL` is empty.
  - Default is `false` (`packages/env/env.ts:71`). Migration only requires setting `DISABLE_SIGNUP=true` in the **production** environment.
  - ✅ **Confirmed:** neither `DISABLE_SIGNUP` nor `ADMIN_EMAIL` was set in the manifests (`cloudhumans/typebot.io-manifests`) → prod signup was OPEN by default. PR #80 adds `DISABLE_SIGNUP: 'true'` to the **base** builder ConfigMap (`deploy-k8s/base/typebot-builder-configmap.yaml`), inherited by both instances (`eddie` + `eddie2`).
- **`ADMIN_EMAIL` is optional, not required.** It's an allowlist of emails that bypass the gate (self-provision without an invitation) — for bootstrap/admin accounts only. Left **unset**, which makes the `signIn` callback the most restrictive (everyone needs an invitation); note the adapter check does NOT enforce in this state (see above). The gate also applies to the **Cloud Hub Login** (`CUSTOM_OAUTH`/Cognito) direct builder login, not just Google — so new internal staff without an invitation are gated too (existing users and CloudChat embedded SSO are unaffected).
- **Embedded CloudChat users are NOT affected by `DISABLE_SIGNUP`.** They authenticate via the `cloudchat-embedded` CredentialsProvider → `cloudchatEmbeddedAuthorize` (verifies the Cognito JWT) → JIT `createCloudChatEmbeddedUser` (direct `p.user.create`, bypasses the adapter gate). It always forwards `createdAt`, so the `signIn` callback's `isNewUser` is `false` and that gate is skipped too. Trust boundary = verified Cognito JWT (`cloudChatAuthorization: true`). So `DISABLE_SIGNUP=true` only locks the **public Google OAuth signup** that External mode newly exposes; embedded SSO logins keep working.
- **Availability — 7-day token expiry in Testing.** While the app's publishing status is **Testing**, refresh tokens for sensitive scopes expire in ~7 days (connections break weekly). This goes away only after **Production + verified**. This is a core reason the migration is needed.
- **Going External + Publish does NOT disconnect existing users/tokens.** New authorizations see the "unverified app" warning screen until verification passes.
- **Scopes come from code, not the console.** `apps/builder/src/pages/api/credentials/google-sheets/consent-url.ts` requests `userinfo.email` + `spreadsheets` + `drive.file` (`access_type=offline`, `prompt=consent`). In **Testing** mode Google does not enforce scope pre-declaration/verification, so test users can grant them directly once the Sheets/Drive **APIs are enabled**. The console "Data access" scope list + justifications only become mandatory for the Production verification submission (Task 4).
- **Redirect URIs are already registered (no-op).** They are a property of the OAuth client, independent of publishing status. Since the app runs 100% in Internal today, the prod redirect URIs (login `${NEXTAUTH_URL}/api/auth/callback/google` and Sheets `${NEXTAUTH_URL}/api/credentials/google-sheets/callback`) are already in place. Going External does not change them — nothing to register.

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
  With `DISABLE_SIGNUP=true` in local `.env` and the builder restarted, signed in via Google with a fresh external account (`xan***@gmail.com` — @alexandre-machado's personal Google account; not admin, no invitation). Result: redirected to `/signin?error=sign-up-disabled`, and **0 `User` + 0 `Account` rows** were created (clean block; the `signIn` callback throws before the adapter creates anything).
  > **Gotcha:** the gate only blocks **new** users (`isNewUser`). An account that already exists in the DB is not blocked. To re-test the block, use an account that has never signed in, or delete its `User` row first.

---

### Task 2: GCP OAuth Consent Screen Transition (Console Steps)

- [ ] **Step 1: Set production environment variable (the "DISABLE_SIGNUP PR")** — 🔄 PR open, not yet merged/deployed
  Env/config change, **not code** (see Key findings). PR [typebot.io-manifests#80](https://github.com/cloudhumans/typebot.io-manifests/pull/80) adds `DISABLE_SIGNUP: 'true'` to `deploy-k8s/base/typebot-builder-configmap.yaml`, inherited by both instances (`eddie` + `eddie2`). `ADMIN_EMAIL` intentionally left unset (most restrictive; all need invite).
  - [ ] Merge PR #80.
  - [ ] Confirm deploy: ArgoCD sync + builder pod restart (env is read at boot, not hot-reloaded).
  - ⚠️ Must be deployed **before** publishing the app as External, so external signup is locked the instant the consent screen opens up.

- [x] **Step 2: OAuth redirect URIs — no action needed**
  Redirect URIs belong to the OAuth client and are independent of publishing status. The app runs in Internal today, so the prod URIs (`${NEXTAUTH_URL}/api/auth/callback/google` and `${NEXTAUTH_URL}/api/credentials/google-sheets/callback`) are already registered. Going External does not change them.

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
  In the GCP Consent Screen "Data access" workflow, add justifications. Note: only `spreadsheets` is **sensitive** and drives verification; `drive.file` is non-sensitive. Justifications match the actual UX — selection is done via the **Google Drive Picker** (`GoogleSpreadsheetPicker.tsx`, loads `gapi`/`picker`), so the app only touches files the user explicitly picks.
  - `https://www.googleapis.com/auth/spreadsheets` *(sensitive)*: "The Google Sheets block reads and writes cell/row data in the spreadsheet the user connects. The Sheets API has no per-file scope, so this broad scope is required to operate on the user-selected sheet."
  - `https://www.googleapis.com/auth/drive.file` *(non-sensitive)*: "Used with the Google Drive Picker so the user explicitly selects which spreadsheet to connect, and to create new spreadsheets on the user's behalf. Grants per-file access only — never the user's full Drive."

- [ ] **Step 2: Submit to Verification Center**
  Provide links to the demo video, privacy policy, and homepage, and submit for verification. After approval, the unverified-app warning disappears and sensitive-scope refresh tokens stop expiring at 7 days.
