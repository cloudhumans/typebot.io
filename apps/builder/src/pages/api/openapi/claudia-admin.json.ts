import { generateOpenApiDocument } from '@lilyrose2798/trpc-openapi'
import { NextApiRequest, NextApiResponse } from 'next'
import { claudiaAdminRouter } from '@/helpers/server/routers/claudiaAdminRouter'

// Curated OpenAPI doc for the GAD's typebot-admin MCP slug. Public, read-only.
// baseUrl is cosmetic: the mcp dispatcher overrides servers[0].url with the
// registry `api` value before handing the spec to FastMCP.from_openapi.
const doc = generateOpenApiDocument(claudiaAdminRouter, {
  title: 'Typebot Claudia Admin API',
  version: '1.0.0',
  baseUrl: 'https://app.typebot.io/api',
})

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache')
  res.status(200).json(doc)
}
