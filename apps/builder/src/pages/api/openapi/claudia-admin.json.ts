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

// Enrichment layer: the source tRPC procedures are shared with the full
// public API (out of scope to edit), so we post-process the generated doc
// here instead. The MCP server derives each tool's description from these
// summary/description fields, so this directly shapes what the GAD sees.
doc.info.description =
  "Authoring API for CloudHumans-managed Typebot flows, exposed to the AI Companion (GAD). Create, edit, publish, and inspect flows using Typebot's canonical contract — payloads are validated server-side, so a flow is born valid or rejected with an actionable error. Authorized as the logged-in user (you can only act on workspaces your account has access to). Authoring-only — does not run or test flows. Your target workspace is provided in the [SYSTEM CONTEXT] as `eddie_workspace_id` — pass it directly as `workspaceId` to createTypebot and listTypebots; do not attempt to look it up. Typical flow: listTypebots(workspaceId) to find a flow's id -> getTypebot to read it -> createTypebot/updateTypebot to author -> publishTypebot to go live."

const OPERATION_DOCS: Record<string, { summary: string; description: string }> =
  {
    createTypebot: {
      summary: 'Create a Typebot flow',
      description:
        'Create a new flow in a workspace. `workspaceId` is the `eddie_workspace_id` from your [SYSTEM CONTEXT] — pass it directly; do not try to discover it. Provide a `typebot` object (`name` is mandatory; groups/blocks/settings are optional and can be added later via updateTypebot). The flow is created as a DRAFT — call publishTypebot to make it live. Returns the created typebot with its generated `id`.',
    },
    updateTypebot: {
      summary: 'Update a Typebot flow',
      description:
        'Edit an existing flow identified by `typebotId` — its groups/blocks, settings, theme, or name. Partial: send only the fields you want to change; read current state with getTypebot first to avoid overwriting. Changes affect the DRAFT only — call publishTypebot to make them live. Get the `typebotId` from listTypebots.',
    },
    publishTypebot: {
      summary: 'Publish a Typebot flow',
      description:
        'Make the current draft of `{typebotId}` the live version. createTypebot and updateTypebot leave changes in draft; call this once the draft is complete. Republishing overwrites the previously published version.',
    },
    getTypebot: {
      summary: 'Get a Typebot flow',
      description:
        'Fetch a single flow by `typebotId`, including its full definition (groups, blocks, settings, theme). Use to read current state before updateTypebot. Get the `typebotId` from listTypebots.',
    },
    listTypebots: {
      summary: 'List Typebot flows (by workspace id)',
      description:
        "Primary way to list flows: pass `workspaceId` (the `eddie_workspace_id` from your [SYSTEM CONTEXT]). Returns each flow's `id`, `name`, and published state — use it to resolve a flow's `typebotId` before get/update/publish.",
    },
    listTypebotsClaudia: {
      summary: 'List Typebot flows (CloudHumans, by workspace name)',
      description:
        'Alternative listing keyed by workspace *name* instead of id, returning a lightweight `{ id, name, publicId }` per flow (optionally filtered by `folderId`). You normally have the workspace id (`eddie_workspace_id`) in context — prefer listTypebots. Use this only when you have a workspace name but not its id.',
    },
    getTypebotHistory: {
      summary: 'Get Typebot version history',
      description:
        'Return the version history of `{typebotId}` — read-only, for reviewing past versions. There is no rollback endpoint; to revert, read a past version and re-apply it via updateTypebot.',
    },
  }

for (const pathItem of Object.values(doc.paths ?? {})) {
  for (const op of Object.values(
    (pathItem ?? {}) as Record<
      string,
      { operationId?: string; summary?: string; description?: string }
    >
  )) {
    const operationId = op?.operationId
    const enrichment = operationId ? OPERATION_DOCS[operationId] : undefined
    if (op && enrichment) {
      op.summary = enrichment.summary
      op.description = enrichment.description
    }
  }
}

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache')
  res.status(200).json(doc)
}
