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
  "Authoring API for CloudHumans-managed Typebot flows, exposed to the AI Companion (GAD). Create, edit, publish, and inspect flows using Typebot's canonical contract — payloads are validated server-side: createTypebot rejects a flow whose edges, blocks or events do not reference each other consistently, and updateTypebot/publishTypebot reject a change that would leave edges pointing at groups or blocks that no longer exist. Authorized as the logged-in user (you can only act on workspaces your account has access to). Authoring-only — does not run or test flows. Your target workspace is provided in the [SYSTEM CONTEXT] as `eddie_workspace_id` — pass it directly as `workspaceId` to createTypebot and listTypebots; do not attempt to look it up. Typical flow: listTypebots(workspaceId) to find a flow's id -> getTypebot to read it -> createTypebot/updateTypebot to author -> publishTypebot to go live. updateTypebot replaces every field it receives wholesale (arrays included), and the server rejects any update or publish that would leave edges pointing at groups that no longer exist; getTypebotHistory + rollbackTypebot restore a previous draft."

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
        'Edit an existing flow identified by `typebotId` — its groups/blocks, settings, theme, or name. Field-level replace: every field you send replaces the stored one entirely, and `groups`, `edges`, `variables` and `events` are arrays that are never merged — a `groups` array with one group leaves the flow with exactly one group. Always read the flow with getTypebot first and resend the COMPLETE array with your change applied (same number of groups unless the user explicitly asked to remove one); fields you omit keep their stored value. The server rejects with 400 any update that would leave edges pointing at groups or blocks that no longer exist, or outgoingEdgeIds pointing at edges that no longer exist; fix it by re-reading the flow with getTypebot and resending the full arrays, never by deleting edges. It rejects with 409 when the flow changed since you read it (another editor or an autosave saved in between): re-read with getTypebot and resend your change. Changes affect the DRAFT only — call publishTypebot to make them live. Get the `typebotId` from listTypebots.',
    },
    publishTypebot: {
      summary: 'Publish a Typebot flow',
      description:
        'Make the current draft of `{typebotId}` the live version. createTypebot and updateTypebot leave changes in draft; call this once the draft is complete. Republishing overwrites the previously published version. Rejected with 400 when the draft has edges pointing at groups or blocks that do not exist — restore the flow (rollbackTypebot or updateTypebot with the complete arrays) before publishing.',
    },
    getTypebot: {
      summary: 'Get a Typebot flow',
      description:
        'Fetch a single flow by `typebotId`, including its full definition (groups, edges, events, variables, settings, theme). Use to read current state before updateTypebot: the response is the complete object to send back, with your change applied, because updateTypebot replaces arrays wholesale. Get the `typebotId` from listTypebots.',
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
        'Return the version history of `{typebotId}` (one snapshot per publish or restore, newest first). Each item carries `hasDanglingReferences`: true means the snapshot itself has edges pointing at missing groups and cannot be restored. To revert the draft, pass a consistent snapshot id to rollbackTypebot.',
    },
    rollbackTypebot: {
      summary: 'Roll back a Typebot draft to a history snapshot',
      description:
        'Overwrite the DRAFT of `{typebotId}` with the groups, edges, events, variables, settings and theme of the history snapshot `{historyId}` (from getTypebotHistory). Rejected with 400 if that snapshot has `hasDanglingReferences` = true. The rollback only touches the draft — call publishTypebot to make it live — and does not restore `tenant` or `toolDescription`, which history does not store.',
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
