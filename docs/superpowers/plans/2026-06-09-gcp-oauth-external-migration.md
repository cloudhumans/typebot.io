# GCP OAuth External Migration (Approach 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely transition the Google OAuth integration to allow external emails (External + In Production) on the GCP Console while verifying that the `DISABLE_SIGNUP` security gate is active and correctly blocking unauthorized users.

**Architecture:** 
1. Validate the `DISABLE_SIGNUP` code path programmatically using a custom Prisma-connected test script.
2. Modify the GCP OAuth configuration directly to External + In Production.
3. Collect required Google assets (unlisted YouTube video, domain ownership, and public policy) and submit for sensitive scopes verification.

**Tech Stack:** NextAuth.js, Prisma, GCP Console, TSX, dotenv-cli

---

### Task 1: Verify the DISABLE_SIGNUP Gate Programmatically

**Files:**
- Create: `docs/superpowers/scratch/verify-signup-block.ts`

- [ ] **Step 1: Write the verification script**
  Create the scratch script that initializes Prisma, mocks the `DISABLE_SIGNUP` environment variable, and calls the custom adapter to ensure it rejects unauthorized new sign-ups.

  ```typescript
  // docs/superpowers/scratch/verify-signup-block.ts
  import { customAdapter } from '../../../apps/builder/src/features/auth/api/customAdapter'
  import { PrismaClient } from '@typebot.io/prisma'

  // Force environment variables for the test run
  process.env.DISABLE_SIGNUP = 'true'
  process.env.ADMIN_EMAIL = 'admin@example.com'

  const prisma = new PrismaClient()
  const adapter = customAdapter(prisma)

  async function runVerification() {
    console.log('--- Starting DISABLE_SIGNUP Verification ---')

    // 1. Generate a random email that does not exist and has no invitations
    const randomUnauthorizedEmail = `unauthorized-${Date.now()}@external-domain.com`

    try {
      console.log(`Testing signup block for unauthorized user: ${randomUnauthorizedEmail}`)
      await adapter.createUser({
        email: randomUnauthorizedEmail,
        emailVerified: null,
      })
      console.error('❌ FAILURE: User creation succeeded but should have been blocked.')
      process.exit(1)
    } catch (err: any) {
      if (err.message === 'New users are forbidden') {
        console.log('✅ SUCCESS: Correctly blocked unauthorized new user sign-up.')
      } else {
        console.error(`❌ FAILURE: Block failed with unexpected error: ${err.message}`)
        process.exit(1)
      }
    }

    // 2. Create an invitation for a test email and verify signup is permitted
    const invitedEmail = `invited-${Date.now()}@external-domain.com`
    console.log(`Setting up invitation for email: ${invitedEmail}`)
    
    // Create a temporary workspace and invitation
    const tempWorkspace = await prisma.workspace.create({
      data: { name: 'Temp Test Workspace' }
    })
    const tempInvitation = await prisma.workspaceInvitation.create({
      data: {
        email: invitedEmail,
        workspaceId: tempWorkspace.id,
        role: 'member'
      }
    })

    try {
      console.log(`Testing allowed signup for invited user: ${invitedEmail}`)
      const createdUser = await adapter.createUser({
        email: invitedEmail,
        emailVerified: null,
      })
      console.log(`✅ SUCCESS: User created successfully with ID: ${createdUser.id}`)

      // Clean up created user, invitation, and workspace
      await prisma.user.delete({ where: { id: createdUser.id } })
      console.log('✅ Temporary user cleaned up.')
    } catch (err: any) {
      console.error(`❌ FAILURE: Allowed signup failed: ${err.message}`)
      process.exit(1)
    } finally {
      await prisma.workspaceInvitation.delete({ where: { id: tempInvitation.id } })
      await prisma.workspace.delete({ where: { id: tempWorkspace.id } })
      console.log('✅ Temporary invitation and workspace cleaned up.')
    }

    console.log('--- All DISABLE_SIGNUP security checks passed! ---')
    process.exit(0)
  }

  runVerification().catch((e) => {
    console.error('Fatal test execution error:', e)
    process.exit(1)
  })
  ```

- [ ] **Step 2: Run the script to verify the security gate**
  Run the script using `tsx` from `@typebot.io/prisma` workspace to ensure it runs correctly and outputs success.

  Run:
  ```bash
  pnpm --filter @typebot.io/prisma exec tsx docs/superpowers/scratch/verify-signup-block.ts
  ```
  Expected output:
  `--- All DISABLE_SIGNUP security checks passed! ---`

- [ ] **Step 3: Delete the scratch script**
  Remove the scratch script so we don't commit temporary testing code into the main repository.

  Run:
  ```bash
  rm docs/superpowers/scratch/verify-signup-block.ts
  ```

- [ ] **Step 4: Commit**
  Commit the progress stating the verification was completed successfully.

  Run:
  ```bash
  git commit --allow-empty -m "test: verified DISABLE_SIGNUP logic with local DB script"
  ```

---

### Task 2: GCP OAuth Consent Screen Transition (Console Steps)

**Files:**
- Modify: `.env` (verify configuration)

- [ ] **Step 1: Check production environment variables**
  Verify that the production environment configs (manifests or env variables) have `DISABLE_SIGNUP=true` explicitly set.

- [ ] **Step 2: Transition GCP User Type to External**
  1. Open the [Google Cloud Console](https://console.cloud.google.com/).
  2. Navigate to **APIs & Services** > **OAuth Consent Screen**.
  3. Click **Edit App**.
  4. Change the User Type to **External**.
  5. Fill in the App Name, User Support Email, and Developer Contact Information.
  6. Save and Continue.

- [ ] **Step 3: Push OAuth Consent Screen to In Production**
  1. Under the OAuth Consent Screen dashboard, locate the **Publishing status**.
  2. Click **Publish App**.
  3. Accept the warning stating that the app will be available to any Google user (it will show the "Unverified App" screen until verified).

---

### Task 3: Setup Verification Assets

- [ ] **Step 1: Verify Domain Ownership**
  Ensure the domain used for authorization (e.g. `cloudhumans.com` or `cloudhumans.io`) is verified in the Google Search Console of the GCP account owner.

- [ ] **Step 2: Host Privacy Policy and Public Homepage**
  Verify that the public homepage and privacy policy are accessible on the verified domain:
  - Homepage: Describing the integration/app purpose.
  - Privacy Policy: Compliant with Google API Services User Data Policy, explaining how the `spreadsheets` and `drive.file` scope data is stored/processed.

- [ ] **Step 3: Record Demo Video**
  Record an unlisted YouTube video showing the authorization flow. The video must show:
  1. The user initiating the OAuth flow from Typebot.
  2. The Google OAuth Consent Screen showing the **Client ID** clearly in the browser URL bar.
  3. The user completing authorization.
  4. A demonstration of reading/writing to a Google Sheet block within a chatbot flow.

---

### Task 4: Submit Verification Request on GCP Console

- [ ] **Step 1: Justification for Scopes**
  In the GCP Consent Screen edit workflow, add justifications for:
  - `https://www.googleapis.com/auth/spreadsheets`: "Users need to connect existing spreadsheets that were not created by the app to read and write row data in their custom chatbot workflows."
  - `https://www.googleapis.com/auth/drive.file`: "Required to create new sheets or access files chosen specifically by the user."

- [ ] **Step 2: Submit to Verification Center**
  Provide the links to the demo video, privacy policy, and homepage, and submit for verification.
