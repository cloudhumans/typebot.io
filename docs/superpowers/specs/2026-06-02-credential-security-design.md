# Design Specification: Credential Security (REST Data Sources)

**Date**: 2026-06-02  
**Status**: Approved  
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

**Mechanism (value-based masking):** During credential resolution, collect every resolved header/query secret value into a `secretValues: Set<string>`. Immediately before persisting any log detail, run each string field (request URL, headers, query string, response excerpt, error messages) through a `maskSecrets(text, secretValues)` helper that replaces each occurrence of a secret value with `••••••••`. This is value-based rather than key-based, so secrets interpolated anywhere (not just known header keys) are still masked. The real request sent upstream retains the true values; only the persisted log copy is masked. The base URL is exempt from masking (it is shown locked in the UI). **Caveat:** to keep that exemption safe, the base URL must not itself carry secrets — at credential-save time reject a `baseUrl` containing userinfo (`https://user:pass@host`) or obviously sensitive query parameters (e.g. `?token=`, `?api_key=`). Secrets belong in the `headers`/`queryParams` arrays, which are masked. See the implementation plan, section 4, for the concrete masking helper.

---

## 🧪 4. Testing Plan
* **Prisma Validation**: Test the schema serialization and deserialization of the new Zod definition.
* **Variables Parsing**: Test variable parsing within the base URL, headers, and query parameters of the credential.
* **Merging Test**: Verify that block-level parameters override credential-level parameters correctly.
* **UI State Checks**: Ensure legacy HTTP blocks correctly fall back to the open URL input.
