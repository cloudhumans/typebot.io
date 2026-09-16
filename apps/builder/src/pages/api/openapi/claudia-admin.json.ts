import { generateOpenApiDocument } from '@lilyrose2798/trpc-openapi'
import { NextApiRequest, NextApiResponse } from 'next'
import { claudiaAdminRouter } from '@/helpers/server/routers/claudiaAdminRouter'
import {
  INFO_DESCRIPTION,
  OPERATION_DOCS,
  CuratedOperationId,
} from '@/helpers/server/openapi/claudiaAdminDocs'

// Curated OpenAPI doc for the GAD's typebot-admin MCP slug. Public, read-only.
// baseUrl is cosmetic: the mcp dispatcher overrides servers[0].url with the
// registry `api` value before handing the spec to FastMCP.from_openapi.
const doc = generateOpenApiDocument(claudiaAdminRouter, {
  title: 'Typebot Claudia Admin API',
  version: '1.0.0',
  baseUrl: 'https://app.typebot.io/api',
})

// Enrichment layer: the source tRPC procedures are shared with the full
// public API (out of scope to edit), so we post-process the generated doc
// here instead. The MCP server derives each tool's description from these
// summary/description fields, so this directly shapes what the GAD sees.
doc.info.description = INFO_DESCRIPTION

for (const pathItem of Object.values(doc.paths ?? {})) {
  for (const op of Object.values(
    (pathItem ?? {}) as Record<
      string,
      { operationId?: string; summary?: string; description?: string }
    >
  )) {
    const operationId = op?.operationId
    const enrichment =
      operationId && operationId in OPERATION_DOCS
        ? OPERATION_DOCS[operationId as CuratedOperationId]
        : undefined
    if (op && enrichment) {
      op.summary = enrichment.summary
      op.description = enrichment.description
    }
  }
}

// trpc-openapi renders Zod unions as JSON Schema `oneOf`, which asserts that
// exactly one branch matches. Zod unions are first-match (at-least-one) and the
// server never enforces exclusivity, so the promise is false: e.g. the workflow
// block's `options` union has a branch that is a bare object, which overlaps the
// `{ action: "Return Output" }` branch and matches both. Consumers (the GAD's
// claudia-agentic) validate tool args client-side against this doc and reject
// payloads the server would accept. `anyOf` is the faithful semantics, so
// rewrite every `oneOf` keyword (a schema key whose value is an array of
// sub-schemas) to `anyOf` across the whole document. A property literally named
// `oneOf` never has an array value (its value is a schema object), so the array
// guard leaves it untouched.
const convertOneOfToAnyOf = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const item of node) convertOneOfToAnyOf(item)
    return
  }
  if (node === null || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (Array.isArray(obj.oneOf)) {
    obj.anyOf = obj.oneOf
    delete obj.oneOf
  }
  for (const value of Object.values(obj)) convertOneOfToAnyOf(value)
}

convertOneOfToAnyOf(doc)

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache')
  res.status(200).json(doc)
}
