# Implementation Plan: Credential Security (REST Data Sources)

This implementation plan outlines the exact file modifications, additions, and validation steps required to introduce secure workspace-scoped REST credentials in the HTTP Request blocks.

---

## 🏗️ 1. Schema & Validation Layer

We will define the schema for the REST API Credentials inside the schemas package. Since we reuse the existing `Credentials` database table, no Prisma migration is needed.

### 📁 Files to Modify:
* **`packages/schemas/features/blocks/integrations/webhook/schema.ts`**
  - Define `restApiCredentialsSchema` using `credentialsBaseSchema`.
  - Add `credentialsId?: string` to `httpRequestOptionsV5Schema`.
* **`packages/schemas/features/credentials.ts`**
  - Import `restApiCredentialsSchema`.
  - Register it in the `credentialsSchema` discriminated union.

### 📝 Code Specifications:

#### `packages/schemas/features/blocks/integrations/webhook/schema.ts`
```typescript
import { credentialsBaseSchema } from '../../shared'

export const restApiCredentialsSchema = z
  .object({
    type: z.literal('rest-api'),
    data: z.object({
      baseUrl: z.string().url("A URL Base configurada precisa ser válida."),
      headers: z.array(
        z.object({
          key: z.string().min(1, "A chave do header não pode ser vazia."),
          value: z.string(),
        })
      ).optional(),
      queryParams: z.array(
        z.object({
          key: z.string().min(1, "A chave do parâmetro não pode ser vazia."),
          value: z.string(),
        })
      ).optional(),
      createdById: z.string().min(1, "O ID do usuário criador é obrigatório."),
    }),
  })
  .merge(credentialsBaseSchema)

export type RestApiCredentials = z.infer<typeof restApiCredentialsSchema>
```

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

---

## 🚀 4. Runtime Layer (Bot Engine)

Execute safe concatenation and merge values correctly on the server side during bot execution.

### 📁 Files to Modify:
* **`packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`**
  - When running an HTTP block, if `block.options.credentialsId` is defined:
    1. Fetch and decrypt the credential from the DB.
    2. Interpolate variables on BOTH the credentials base parameters and the block configurations.
    3. Concatenate the URLs safely: `const resolvedUrl = cleanUrlConcat(parsedBaseUrl, blockUrlSuffix)`.
    4. Merge headers: global headers + local headers (local overrides global).
    5. Merge query parameters: global queryParams + local queryParams (local overrides global).
    6. Mask global header values in transaction log details to ensure secret variables are never logged.

### 📝 Code Specifications (Concatenation & Merging logic):
```typescript
const cleanUrlConcat = (base: string, suffix: string): string => {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${cleanBase}${cleanSuffix}`
}
```

---

## 🧪 5. Testing & Verification Checklist

To verify that the feature works and maintains retrocompatibility:

### ⚙️ Unit & Integration Tests
1. **Zod Validation Test**: Verify that valid `rest-api` credential values pass schema check, and invalid/empty fields fail.
2. **Merging Rules Test**: Verify that local headers/query params override global values in `executeWebhookBlock.ts`.
3. **Safe Concatenation Test**: Verify that combinations like `http://example.com/` + `/path` resolve to `http://example.com/path` without doubling slashes.
4. **Credential Decryption Failure handling**: Verify behavior if a referenced credential has been deleted or cannot be decrypted.

### 🌐 E2E & Playwright Coverage
* Add a test case in `apps/builder/src/features/blocks/integrations/webhook/webhook.spec.ts` (or playwright spec):
  - Add a REST API Credential named "Test Sec Cred" with headers and a base URL.
  - Create a flow with an HTTP block. Select the "Test Sec Cred" credential.
  - Validate that the URL input becomes locked, showing the base URL tag, and allows typing only the path suffix.
  - Test run the block and assert that request executes successfully and header secrets are masked in logs.
