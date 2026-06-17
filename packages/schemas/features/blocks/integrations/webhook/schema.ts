import { z } from '../../../../zod'
import { blockBaseSchema, credentialsBaseSchema } from '../../shared'
import { IntegrationBlockType } from '../constants'
import { HttpMethod, maxTimeout } from './constants'

const restApiCredentialsKeyValueSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
})

// The base URL is shown in clear text in the builder and is not value-masked in
// logs, so it must not itself carry secrets: enforce http(s) and reject userinfo
// (e.g. https://user:pass@host).
const isSafeBaseUrl = (url: string) => {
  try {
    const parsed = new URL(url.trim())
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      // No query string / fragment: those could carry secrets (e.g. ?token=)
      // that would leak via the clear-text, unmasked base URL.
      parsed.search === '' &&
      parsed.hash === ''
    )
  } catch {
    return false
  }
}

export const restApiCredentialsSchema = z
  .object({
    type: z.literal('rest-api'),
    data: z.object({
      baseUrl: z.string().trim().url().refine(isSafeBaseUrl),
      headers: z.array(restApiCredentialsKeyValueSchema).optional(),
      queryParams: z.array(restApiCredentialsKeyValueSchema).optional(),
    }),
  })
  .merge(credentialsBaseSchema)

export type RestApiCredentials = z.infer<typeof restApiCredentialsSchema>

const variableForTestSchema = z.object({
  id: z.string(),
  variableId: z.string().optional(),
  value: z.string().optional(),
})

const responseVariableMappingSchema = z.object({
  id: z.string(),
  variableId: z.string().optional(),
  bodyPath: z.string().optional(),
})

const keyValueSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  value: z.string().optional(),
})

export const httpRequestV5Schema = z.object({
  id: z.string(),
  queryParams: keyValueSchema.array().optional(),
  headers: keyValueSchema.array().optional(),
  method: z.nativeEnum(HttpMethod).optional(),
  url: z.string().optional(),
  body: z.string().optional(),
})

const httpRequestSchemas = {
  v5: httpRequestV5Schema,
  v6: httpRequestV5Schema.omit({
    id: true,
  }),
}

const httpRequestSchema = z.union([
  httpRequestSchemas.v5,
  httpRequestSchemas.v6,
])

export const httpRequestOptionsV5Schema = z.object({
  credentialsId: z.string().optional(),
  variablesForTest: z.array(variableForTestSchema).optional(),
  responseVariableMapping: z.array(responseVariableMappingSchema).optional(),
  isAdvancedConfig: z.boolean().optional(),
  isCustomBody: z.boolean().optional(),
  isExecutedOnClient: z.boolean().optional(),
  webhook: httpRequestSchemas.v5.optional(),
  timeout: z.number().min(1).max(maxTimeout).optional(),
})

const httpRequestOptionsSchemas = {
  v5: httpRequestOptionsV5Schema,
  v6: httpRequestOptionsV5Schema.merge(
    z.object({
      webhook: httpRequestSchemas.v6.optional(),
    })
  ),
}

const httpBlockV5Schema = blockBaseSchema.merge(
  z.object({
    type: z
      .enum([IntegrationBlockType.WEBHOOK])
      .describe('Legacy name for HTTP Request block'),
    options: httpRequestOptionsSchemas.v5.optional(),
    webhookId: z.string().optional(),
  })
)

export const httpBlockSchemas = {
  v5: httpBlockV5Schema,
  v6: httpBlockV5Schema
    .omit({
      webhookId: true,
    })
    .merge(
      z.object({
        options: httpRequestOptionsSchemas.v6.optional(),
      })
    ),
}

const httpBlockSchema = z.union([httpBlockSchemas.v5, httpBlockSchemas.v6])

export const executableHttpRequestSchema = z.object({
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  method: z.nativeEnum(HttpMethod).optional(),
})

export type KeyValue = { id: string; key?: string; value?: string }

export type HttpResponse = {
  statusCode: number
  data?: unknown
}

export type ExecutableHttpRequest = z.infer<typeof executableHttpRequestSchema>

export type HttpRequest = z.infer<typeof httpRequestSchema>
export type HttpRequestBlock = z.infer<typeof httpBlockSchema>
export type HttpRequestBlockV6 = z.infer<typeof httpBlockSchemas.v6>
export type ResponseVariableMapping = z.infer<
  typeof responseVariableMappingSchema
>
export type VariableForTest = z.infer<typeof variableForTestSchema>
