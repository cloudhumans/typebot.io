# Design Specification: Credential Security (REST Data Sources)

**Date**: 2026-06-02  
**Updated**: 2026-06-29  
**Status**: Implemented (reflects shipped code)  
**Author**: Antigravity AI  

---

## 🎯 Executive Summary
This design document specifies the architecture, data layer, UI components, and secure execution runtime for the **Credential Security (REST Data Sources)** feature. 
The feature introduces workspace-scoped REST API credentials to mask secrets and lock Base URLs, preventing token exfiltration in HTTP blocks while supporting dynamic variable interpolation.

---

## 💾 1. Data Layer: REST Data Source Schema

We reuse the existing generic `Credentials` Prisma model, with **one additive, nullable migration** (`createdById`) for auditing. The migration is additive and nullable, so existing rows become `null` and retrocompatibility is preserved.

### 1.1 Database Representation (`Credentials` Table)
* `type`: `"rest-api"`
* `name`: User-defined label (e.g., `"Stripe Production"`).
* `workspaceId`: Binds the credential strictly to the owner workspace.
* `data`: Symmetric-key encrypted JSON payload using `ENCRYPTION_SECRET`.
* `iv`: Initialization vector for the encrypted string.
* `createdAt`: Automatically populated database timestamp.
* `createdById` *(new, nullable)*: Auditing column holding the creator's user id. Stored as a **dedicated column** (not in the encrypted `data`) so creator lookups don't require decrypting each row. Optional relation to `User` with `onDelete: SetNull`.

### 1.2 Encrypted JSON Schema (`data` payload)
The decrypted JSON structure inside the `data` field contains base URL, headers, and query parameters. Creator auditing (`createdById`) lives in a dedicated column, **not** in this payload:
```json
{
  "baseUrl": "https://api.stripe.com/v1",
  "headers": [
    {
      "key": "Authorization",
      "value": "Bearer <API_TOKEN>"
    }
  ],
  "queryParams": [
    {
      "key": "api_key",
      "value": "<REDACTED>"
    }
  ]
}
```

### 1.3 Schema Validation (Zod)
We define the structure validation in `@typebot.io/schemas`:
```typescript
// Use the repo's local zod wrapper (applies zod-openapi), not the raw `zod` package.
import { z } from '../zod'

export const restApiCredentialDataSchema = z.object({
  baseUrl: z.string().url(),
  headers: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      })
    )
    .optional(),
  queryParams: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      })
    )
    .optional(),
})

export type RestApiCredentialData = z.infer<typeof restApiCredentialDataSchema>
```

> Validators are kept message-less (`.url()`, `.min(1)`), matching the other credential schemas in `@typebot.io/schemas`. User-facing copy lives in the UI layer. `headers` and `queryParams` are optional so a credential can carry only a base URL. `createdById` is **not** part of this encrypted payload — it is a dedicated `Credentials` column (added to `credentialsBaseSchema` as `z.string().nullable()`).

---

## 🎨 2. UI Layer: REST Credentials & HTTP Block URL Locking

### 2.1 Credentials Management Modal (`RestApiCredentialsModal.tsx`)
A new modal is opened when the builder clicks "Connect New" in the HTTP block's `CredentialsDropdown`.
* **Inputs**:
  - Name (String input).
  - Base URL (String input, validated as URL).
  - Headers Table: Dynamic key-value row insertion. Header values are masked (using input `type="password"`) for security, displaying `••••••••` upon reload.
  - Query Params Table: Dynamic key-value row insertion with masked values.
* **Auditing**: Automatically captures `ctx.user.id` on submit and stores it in the dedicated `createdById` column (not in the encrypted JSON payload), enabling creator lookups without decryption.

### 2.2 Block UI State Transitions
The HTTP Request Block settings panel dynamically adjusts based on the active `CredentialsDropdown` state:

* **State 1: Custom URL / No Authentication**
  - Displays a single, open URL text input.
  - Allows full inline editing of local headers and query parameters.
  - Guarantees 100% retrocompatibility with legacy blocks (where `credentialsId` is undefined).
* **State 2: Secured Credential Active**
  - Replaces the URL text input with a locked combination: `[ 🔒 Credential Base URL ]` (Read-only tag) followed by `[ Suffix / Relative Path Suffix ]` (Editable input).
  - Shows inherited global headers and query parameters at the top of their respective lists as read-only, masked entries (e.g. `Authorization: ••••••••••••`).
  - The graph node preview shows an inline lock icon before the resolved URL (`🔒 GET <baseUrl><suffix>`); the lock carries a tooltip explaining secure mode.

### 2.3 Internationalization (i18n)
All user-facing copy for this feature resolves through **Tolgee** (`useTranslate` / `t('...')`), under the `blocks.integrations.httpRequest.*` key namespace, instead of being hardcoded. Keys are maintained in the locale files the fork keeps in lockstep — **`en.json` (default + fallback), `pt-BR.json`, and `es.json`**; the remaining locales (`de`, `fr`, `it`, `pt`, `ro`) fall back to `en`. Validation messages (e.g. invalid base URL) live in the UI layer as i18n keys, never in the Zod schema (which stays message-less).

---

## 🚀 3. Execution Layer: Safe Server-Side Runtime & Parsing

### 3.1 Parsing & Merging (`executeWebhookBlock.ts`)
When the bot-engine runs an HTTP block:
1. **Fetch & Decrypt (workspace-scoped)**: If `block.options.credentialsId` is present, the server retrieves the record **filtered by both `credentialsId` AND the executing typebot's `workspaceId`** (`findFirst({ where: { id, workspaceId, type: 'rest-api' } })`) and decrypts it. Fetching by `credentialsId` alone is forbidden — it would let a flow reference another workspace's secret. A non-match aborts the block.
2. **Variable Interpolation**: Apply `parseVariables` over the decrypted credentials fields (`baseUrl`, `headers`, `queryParams`) and the block-level configuration fields.
3. **Merging Rules**:
   - **URL Resolution**: `parsedBaseUrl` is concatenated with `parsedSubPath` (normalizing double slashes).
   - **Headers**: Merge parsed global headers and local headers. Block-level local headers override global ones in case of duplicate keys.
   - **Query Params**: Merge parsed global and local parameters. Block-level local parameters override global ones.
4. **Resolved-URL validation (SSRF)**: `z.string().url()` runs at save time, but variable interpolation can rewrite the host afterward. Before issuing the request, validate the *resolved* URL: scheme allowlist (`http`/`https`) and rejection of private/loopback/link-local hosts and the metadata IP `169.254.169.254`. SSRF is pre-existing in this block (variables already interpolate into arbitrary URLs), so the check should be a shared helper applied to both the credentialed and legacy paths; if deferred, track it as an explicit follow-up.

### 3.2 Logging Security
All transaction traces and error messages stored in `ChatLog` must mask variables originating from the secure credentials database record, preserving secrecy in production dashboard listings.

**Mechanism (value-based masking):** During credential resolution, collect every resolved header/query secret value into a `secretValues: Set<string>`. Immediately before persisting any log detail, run each string field (request URL, headers, query string, response excerpt, error messages) through a `maskSecrets(text, secretValues)` helper that replaces each occurrence of a secret value with `••••••••`. This is value-based rather than key-based, so secrets interpolated anywhere (not just known header keys) are still masked. The real request sent upstream retains the true values; only the persisted log copy is masked. The base URL is exempt from masking (it is shown locked in the UI). **Caveat:** to keep that exemption safe, the base URL must not itself carry secrets — at credential-save time reject a `baseUrl` containing userinfo (`https://user:pass@host`) or obviously sensitive query parameters (e.g. `?token=`, `?api_key=`). Secrets belong in the `headers`/`queryParams` arrays, which are masked. The concrete helper lives in `packages/bot-engine/blocks/integrations/webhook/restApiCredential.ts`.

---

## 📦 4. Import / Export & Retrocompatibility

A typebot references a credential only by `block.options.credentialsId`. The encrypted secret payload (`baseUrl`, `headers`, `queryParams`) lives in the `Credentials` table, **never** in the typebot document.

* **Export:** serializes `credentialsId` (the id only). No secret data ever leaves the workspace — an export can carry, at most, a dangling id.
* **Import / cross-workspace duplication:** handled by the existing `sanitizeGroups → sanitizeBlock` path in `createTypebot` (`apps/builder/src/features/typebot/helpers/sanitizers.ts`). Its generic `default` case runs `sanitizeCredentialsId(workspaceId)`, which looks the id up in the **target** workspace and returns `undefined` when absent. The HTTP Request block inherits this automatically because `credentialsId` is part of `httpRequestOptionsV5Schema` — no feature-specific code needed.
  - No credential → untouched (custom-URL mode, fully retrocompatible).
  - Credential present, same workspace → id resolves, kept.
  - Credential present, different workspace → id nulled → block falls back to custom-URL mode; the user must reconfigure.
* **Builder fallback:** when a referenced credential is missing, `getRestApiCredential` returns `NOT_FOUND`; the settings panel renders the open URL input and `CredentialsDropdown` shows the default label. The stale id is normalized to `undefined` on the next dropdown change.
* **Known edge:** a credentialed block that loses its credential on cross-workspace import keeps its path suffix (e.g. `/orders`) in `webhook.url`, which is an invalid absolute URL until reconfigured — consistent with other credential-backed blocks.

---

## 🗑️ 5. Deletion Semantics

A credential can be referenced by many flows, so deletion is guarded.

* **In-use guard:** `deleteCredentials` (tRPC) and the legacy REST route (`/api/credentials/:id`) call `findCredentialsUsages` inside the delete transaction. If the credential is still referenced, a normal delete is rejected — tRPC throws `PRECONDITION_FAILED`, REST returns `412` — and the UI opens `CredentialInUseModal` listing the referencing flows (each linked to its editor, badged draft/published). `findCredentialsUsages` covers **both** surfaces a flow can reference a credential from: `block.options.credentialsId` (JSONB) and the typebot-level `Typebot.whatsAppCredentialsId` column. REST API credentials remain admin-only to delete.
* **Force-delete ("remove anyway"):** the modal offers a destructive red action that re-issues the delete with `force: true`, bypassing the guard. The deleted secret is gone, so **published flows that referenced it stop issuing their request at runtime** (`resolveRestApiCredentialData` → `null` → block aborts) until the block is reconfigured and the flow is **republished** — the modal warns about this. Drafts self-heal in the builder (custom-URL fallback). Every deletion of a still-referenced credential is audited (`logger.warn` `credential_deleted_in_use` with `usageCount` / `blockingCount` / `forced`), regardless of the force or current-draft path.
  * **Type-the-name confirmation:** because force-delete is the one credential action that breaks live flows, `CredentialInUseModal` gates it behind typing the exact credential name — the "remove anyway" button stays disabled until the typed value matches (trimmed). The name comparison is the guard, so the modal's `RestApiCredentialsModal` footer "Delete" button is disabled while edit data is still loading (`showLoader`), otherwise the in-use modal could open with an empty name and the match would pass vacuously. Deleting an **unreferenced** credential is not gated this way (it breaks nothing) and the deprecate/save-while-in-use variant keeps no guard (it's reversible).
* **Current-draft exclusion:** the client passes `currentTypebotId` (the flow open in the editor). The guard excludes that flow's **draft** usage (`source === 'Typebot' && typebotId === currentTypebotId`) so deleting a credential used only by the open flow just clears the block (the editor drops `credentialsId` on success). **The published version of the same flow still blocks** (its `PublicTypebot` usage is *not* excluded) — force-deleting would break it in production, so the warning/modal is intentional there. `currentTypebotId` is a client hint and usages are already workspace-scoped, so it grants no new capability (the caller can force-delete regardless); the audit log above covers the path.
* **`missingCredential` validation:** because deletion leaves a dangling `credentialsId` (it lives in JSONB / the `whatsAppCredentialsId` column — no FK nulls it), a `missingCredential` flow-validation error flags any block, and the typebot-level `whatsAppCredentialsId`, whose credential no longer resolves in the workspace. It surfaces in the validation drawer, the group alert icon, and the header badge (typebot-level errors render under a "Flow settings" label, with no group). Validation runs workspace-scoped (`workspaceId` threaded through `validateTypebot`) and re-runs after a credential delete (`revalidate()`). `missingCredential` (removed / no-longer-resolving) is a blocking error and takes precedence over the `deprecatedCredential` warning (still resolves at runtime); they are distinct types — a removed credential is never reported as merely deprecated.
  * **Known limitation — cross-session staleness:** editor validation is *content-keyed* (re-runs only when this session's groups/edges/settings/variables change) plus the explicit `revalidate()` fired on a *same-session* credential delete. A credential deleted by **another session/workflow** does not change the open editor's content, so the drawer keeps showing the **last validated state** (e.g. a stale `deprecatedCredential` warning) until the page is reloaded — at which point validation re-runs against the DB and correctly reports `missingCredential`. This is a UI-freshness artifact, not a misclassification; reopening resolves it. (A focus/visibility-triggered `revalidate()` would close the gap if it proves disruptive in practice.)

---

## 🧪 6. Testing Plan
* **Prisma Validation**: Test the schema serialization and deserialization of the new Zod definition.
* **Variables Parsing**: Test variable parsing within the base URL, headers, and query parameters of the credential.
* **Merging Test**: Verify that block-level parameters override credential-level parameters correctly.
* **UI State Checks**: Ensure legacy HTTP blocks correctly fall back to the open URL input.
* **Import Sanitization**: Importing a typebot referencing a `credentialsId` absent from the target workspace nulls the id (via `sanitizeBlock`) and falls back to custom-URL mode; an exported typebot JSON contains no decrypted secret values.
