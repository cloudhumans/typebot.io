# Implementation Plan: Credential Security (REST Data Sources)

This implementation plan outlines the exact file modifications, additions, and validation steps required to introduce secure workspace-scoped REST credentials in the HTTP Request blocks.

---

## 🏗️ 1. Schema & Validation Layer

We will define the schema for the REST API Credentials inside the schemas package, reusing the existing `Credentials` database table. One small **additive** Prisma migration is required: a nullable `createdById` column for auditing (see below). It is additive and nullable, so existing rows become `null` and retrocompatibility is preserved.

### 📁 Files to Modify:
* **`packages/prisma/postgresql/schema.prisma`** (+ generated migration)
  - Add a nullable `createdById String?` column to the `Credentials` model for creator auditing, with an optional relation to `User` (`onDelete: SetNull`, so deleting a user does not delete their credentials). Run `prisma migrate dev` to generate the additive migration.
* **`packages/schemas/features/blocks/shared.ts`**
  - Add `createdById: z.string().nullable()` to `credentialsBaseSchema` (it mirrors the `Credentials` row minus `data`/`type`), so every credential type exposes the audit field at the record level.
* **`packages/schemas/features/blocks/integrations/webhook/schema.ts`**
  - Define `restApiCredentialsSchema` using `credentialsBaseSchema`.
  - Add `credentialsId?: string` to `httpRequestOptionsV5Schema`.
* **`packages/schemas/features/credentials.ts`**
  - Import `restApiCredentialsSchema`.
  - Register it in the `credentialsSchema` discriminated union.

### 📝 Code Specifications:

#### `packages/schemas/features/blocks/integrations/webhook/schema.ts`
```typescript
import { z } from '../../../zod'
import { credentialsBaseSchema } from '../../shared'

export const restApiCredentialsSchema = z
  .object({
    type: z.literal('rest-api'),
    data: z.object({
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
    }),
  })
  .merge(credentialsBaseSchema)

export type RestApiCredentials = z.infer<typeof restApiCredentialsSchema>
```

> **Nota (convenções do repo):** importar `z` do wrapper local (`packages/schemas/zod.ts`) e não do pacote `zod` direto — o wrapper aplica `zod-openapi`. Validadores ficam sem mensagens custom (ex.: `.url()`, `.min(1)`), seguindo o padrão dos demais credential schemas. Mensagens voltadas ao usuário ficam na camada de UI via i18n (Tolgee) — ver seção 3.1.

> **Auditoria:** `createdById` **não** fica no payload `data` criptografado. Ele é uma coluna dedicada (nullable) na tabela `Credentials`, exposta via `credentialsBaseSchema`. Isso permite consultar quem criou uma credencial sem descriptografar cada registro (relatórios de auditoria, remoção de acesso). A migration é aditiva e nullable, então credenciais legadas ficam com `createdById = null`.

Add `credentialsId` inside `httpRequestOptionsV5Schema`:
```typescript
export const httpRequestOptionsV5Schema = z.object({
  credentialsId: z.string().optional(),
  variablesForTest: z.array(variableForTestSchema).optional(),
  // ... (rest remains unchanged)
})
```

---

## 📡 2. Backend & API Layer (tRPC Router)

We need to register the new schema in the creation endpoint and add a secure query to expose credential metadata to the builder without sending actual secrets to the client.

### 📁 Files to Modify/Create:
* **`apps/builder/src/features/credentials/api/createCredentials.ts`**
  - Import `restApiCredentialsSchema` and include its fields in the validation union.
  - **Authorization:** creating a `rest-api` credential must be restricted to workspace **admins** (since the secret controls network destinations). Reuse the existing membership/role guard (e.g. `isWriteWorkspaceForbidden` / member-role check used by the other credential mutations) and reject non-admins with `FORBIDDEN`. Always bind the new record to the caller's `workspaceId`.
  - **Auditing:** set the new `createdById` **column** to `ctx.user.id` on insert (not inside the encrypted `data` payload).
* **`apps/builder/src/features/credentials/api/getRestApiCredential.ts`** (NEW)
  - Implement a secure read endpoint that returns only masked fields (e.g. replacing secret values with `••••••••`).
* **`apps/builder/src/features/credentials/api/router.ts`**
  - Register `getRestApiCredential` query.

### 📝 Code Specifications:

#### `apps/builder/src/features/credentials/api/getRestApiCredential.ts`
```typescript
import prisma from '@typebot.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { decrypt } from '@typebot.io/lib/api/encryption/decrypt'
import { z } from 'zod'
import { isReadWorkspaceFobidden } from '@/features/workspace/helpers/isReadWorkspaceFobidden'
import { RestApiCredentials } from '@typebot.io/schemas'

export const getRestApiCredential = authenticatedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      credentialsId: z.string(),
    })
  )
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      baseUrl: z.string(),
      headers: z.array(z.object({ key: z.string(), value: z.string() })),
      queryParams: z.array(z.object({ key: z.string(), value: z.string() })),
    })
  )
  .query(async ({ input: { workspaceId, credentialsId }, ctx: { user } }) => {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        id: true,
        members: true,
        credentials: {
          where: { id: credentialsId, type: 'rest-api' },
        },
      },
    })
    
    if (!workspace || isReadWorkspaceFobidden(workspace, user))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

    const credential = workspace.credentials[0]
    if (!credential)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' })

    const decrypted = (await decrypt(credential.data, credential.iv)) as RestApiCredentials['data']

    return {
      id: credential.id,
      name: credential.name,
      baseUrl: decrypted.baseUrl,
      headers: (decrypted.headers ?? []).map(h => ({ key: h.key, value: '••••••••' })),
      queryParams: (decrypted.queryParams ?? []).map(q => ({ key: q.key, value: '••••••••' })),
    }
  })
```

---

## 🎨 3. UI Layer (React Components)

Introduce the selection flow and lock down inputs in the settings panel.

### 📁 Files to Modify/Create:
* **`apps/builder/src/features/blocks/integrations/webhook/components/RestApiCredentialsModal.tsx`** (NEW)
  - Credentials creation modal allowing workspace admins to define secure credentials.
* **`apps/builder/src/features/blocks/integrations/webhook/components/HttpRequestSettings.tsx`**
  - Add the `CredentialsDropdown` component.
  - Implement dynamic rendering: if a credential is selected, show locked URL combination, otherwise display a normal URL text input.
* **`apps/builder/src/features/blocks/integrations/webhook/components/HttpRequestAdvancedConfigForm.tsx`**
  - Pass down credential configuration and display read-only inherited headers & query parameters when active.

### 🌐 3.1 Validation Messages (i18n)

Validation/error copy lives in the **UI layer**, not in the Zod schema (schemas stay message-less — see section 1). The repo uses **Tolgee** (`@tolgee/react`) with flat-key locale files under `apps/builder/src/i18n/*.json`. Resolve messages via `const { t } = useTranslate()` inside the modal/form components.

* **Files to modify:** add the following keys to **every** locale file (`en.json`, `pt-BR.json`, `pt.json`, `es.json`, `fr.json`, `it.json`, `de.json`, `ro.json`). At minimum `en.json` (fallback) and `pt-BR.json` must be filled; the others should at least carry the English fallback so no key is missing.

  | Key | `pt-BR.json` | `en.json` |
  |-----|--------------|-----------|
  | `credentials.restApi.invalidBaseUrl` | `A URL Base configurada precisa ser válida.` | `The configured Base URL must be valid.` |
  | `credentials.restApi.emptyHeaderKey` | `A chave do header não pode ser vazia.` | `The header key cannot be empty.` |
  | `credentials.restApi.emptyQueryParamKey` | `A chave do parâmetro não pode ser vazia.` | `The query parameter key cannot be empty.` |
  | `credentials.restApi.nameRequired` | `O nome da credencial é obrigatório.` | `The credential name is required.` |

* **Usage:** map Zod `safeParse` errors (or per-field UI validation) to these keys, e.g. `t('credentials.restApi.invalidBaseUrl')`. This keeps the schema reusable on the server (where there is no `t`) while showing localized copy to the builder.

---

## 🚀 4. Runtime Layer (Bot Engine)

Execute safe concatenation and merge values correctly on the server side during bot execution.

### 📁 Files to Modify:
* **`packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`**
  - When running an HTTP block, if `block.options.credentialsId` is defined:
    1. Fetch and decrypt the credential from the DB **scoped to the executing typebot's `workspaceId`**: query `prisma.credentials.findFirst({ where: { id: credentialsId, workspaceId, type: 'rest-api' } })`. If no record matches (wrong workspace, deleted, or wrong type), abort the block with an error log — **never** fetch by `credentialsId` alone, otherwise a flow could reference another workspace's secret.
    2. Interpolate variables on BOTH the credentials base parameters and the block configurations.
    3. Concatenate the URLs safely: `const resolvedUrl = cleanUrlConcat(parsedBaseUrl, blockUrlSuffix)`.
    4. **Validate the resolved URL before issuing the request** (see SSRF note below).
    5. Merge headers: global headers + local headers (local overrides global).
    6. Merge query parameters: global queryParams + local queryParams (local overrides global).
    7. Mask credential-derived values in the transaction log (see masking mechanism below).

> **⚠️ SSRF (pre-existing, hardening opportunity):** The HTTP Request block already interpolates session variables into arbitrary URLs today, with no host validation — so post-interpolation SSRF is not introduced by this feature, but the credential flow (locked base URL implying "trusted") makes it worth hardening. Because variables can rewrite the host after `z.string().url()` save-time validation, add a runtime check on the *resolved* URL before `ky(...)`: enforce a scheme allowlist (`http`/`https` only) and reject hosts resolving to private/loopback/link-local ranges and the cloud metadata IP (`169.254.169.254`). To avoid behavioral drift, apply this check to the whole block (credentialed and legacy paths) behind a shared helper, not only the credentialed path. If full SSRF hardening is out of scope for this PR, file a follow-up and call it out explicitly rather than silently skipping it.

### 📝 Code Specifications (Concatenation & Merging logic):
```typescript
const cleanUrlConcat = (base: string, suffix: string): string => {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  // Empty suffix → return base unchanged (no trailing slash)
  if (!suffix) return cleanBase
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${cleanBase}${cleanSuffix}`
}
```

### 🔒 Secret Masking Mechanism (logs)

The masking is **deterministic and value-based**, applied right before persisting to `ChatLog`. We do not rely on a header-key blocklist (variables can be interpolated anywhere — URL, query params, body), so we mask by the resolved secret *values* themselves:

1. While resolving the credential, collect the set of sensitive resolved strings into a `secretValues: Set<string>` — every interpolated `headers[].value` and `queryParams[].value` originating from the decrypted credential record (skip empty strings).
2. Define a helper:
   ```typescript
   const maskSecrets = (text: string, secretValues: Set<string>): string => {
     let masked = text
     for (const secret of secretValues) {
       if (!secret) continue
       masked = masked.split(secret).join('••••••••')
     }
     return masked
   }
   ```
3. Apply `maskSecrets` to every string field of the log detail (request URL, headers, query string, response body excerpt, and error messages) before calling the log-creation path. The raw request sent to the upstream API keeps the real values; only the persisted/returned log copy is masked.
4. The base URL itself is **not** masked (it is shown locked in the UI by design), only the header/query secret values are.

---

## 🧪 5. Testing & Verification Checklist

To verify that the feature works and maintains retrocompatibility:

### ⚙️ Unit & Integration Tests
1. **Zod Validation Test**: Verify that valid `rest-api` credential values pass schema check, and invalid/empty fields fail.
2. **Merging Rules Test**: Verify that local headers/query params override global values in `executeWebhookBlock.ts`.
3. **Safe Concatenation Test**: Verify that combinations like `http://example.com/` + `/path` resolve to `http://example.com/path` without doubling slashes, **and that an empty suffix returns the base URL unchanged** (no trailing slash added).
4. **Credential Decryption Failure handling**: Verify behavior if a referenced credential has been deleted or cannot be decrypted.
5. **Secret Masking Test**: Verify that resolved credential header/query values are replaced with `••••••••` in persisted `ChatLog` entries (URL, headers, query string, response excerpt, error messages), while the real request still carries the actual values.
6. **Workspace Binding Test**: Verify that referencing a `credentialsId` belonging to a *different* workspace aborts the block (no fetch/leak), and that a credential from the same workspace resolves correctly.
7. **Authorization Test**: Verify that a non-admin workspace member is rejected (`FORBIDDEN`) when creating a `rest-api` credential.
8. **SSRF Validation Test**: Verify that a resolved URL pointing at a private/loopback host or `169.254.169.254`, or using a non-`http(s)` scheme, is rejected before the request is issued.
9. **Base URL Hygiene Test**: Verify that saving a credential whose `baseUrl` contains userinfo (`user:pass@`) or a sensitive query param is rejected.

### 🌐 E2E & Playwright Coverage
* Add a test case in `apps/builder/src/features/blocks/integrations/webhook/webhook.spec.ts` (or playwright spec):
  - Add a REST API Credential named "Test Sec Cred" with headers and a base URL.
  - Create a flow with an HTTP block. Select the "Test Sec Cred" credential.
  - Validate that the URL input becomes locked, showing the base URL tag, and allows typing only the path suffix.
  - Test run the block and assert that request executes successfully and header secrets are masked in logs.
