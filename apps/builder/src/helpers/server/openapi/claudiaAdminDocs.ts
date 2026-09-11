import type { ClaudiaAdminRouter } from '@/helpers/server/routers/claudiaAdminRouter'

export type CuratedOperationId = keyof ClaudiaAdminRouter['_def']['procedures']

export const INFO_DESCRIPTION =
  'Authoring and debugging API for CloudHumans-managed Typebot flows, exposed to the AI Companion (GAD). Create, edit, inspect, run (TOOL and CONTEXT_ENRICHMENT drafts) and publish flows using Typebot\'s canonical contract — payloads are validated server-side, so a flow is born valid or rejected with an actionable error. Authorized as the logged-in user (you can only act on workspaces your account has access to). Your target workspace is provided in the [SYSTEM CONTEXT] as `eddie_workspace_id` — pass it directly as `workspaceId` to createTypebot and listTypebots; do not attempt to look it up. Typical flow: listTypebots(workspaceId) to find a flow\'s id -> getTypebot to read it -> createTypebot/updateTypebot to author -> runTypebotDraft to test the draft and read `status`/`error` -> fix with updateTypebot and run again -> publishTypebot only once runTypebotDraft returns status "success".'

export const OPERATION_DOCS: Record<
  CuratedOperationId,
  { summary: string; description: string }
> = {
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
  runTypebotDraft: {
    summary:
      'Run a TOOL or CONTEXT_ENRICHMENT draft headlessly and get a debugging verdict',
    description:
      'Your debugging tool. Executes the DRAFT of `{typebotId}` (never the published version) with the same engine and inputs production uses, with three differences: e-mail blocks are skipped, no result is saved, and linked flows run their drafts too. Webhooks really execute. Works for TOOL flows (`variables` = the tool parameters) and CONTEXT_ENRICHMENT flows (`variables` = the conversation context Claudia injects, e.g. helpdeskId, activeIntent, lastUserMessages, messages, so you can test with a forged conversation); conversational flows are rejected with 400. Read `status` first: "success" means a Tool Output was produced (`output` is what production would receive); if `error` is set anyway, a block failed on a non-fatal path and production would deliver `output` regardless, so fix it before publishing; "error" means the flow failed and `error` gives the reason (`message`), the raw `details` (e.g. webhook response) and, when the failure is tied to a block, `blockId` and `blockType` (`blockType` may be absent for blocks inside linked flows); "paused" means the flow stopped at an input block waiting for a human, which headless flows (TOOL and CONTEXT_ENRICHMENT) must never do. `logs` are the full unfiltered execution logs, `trail` the edges traversed and `variables` the values held at the end, so you can see how far the flow got and what it computed. A missing required variable is reported as an error naming the variable. Fix the draft with updateTypebot, run again, and call publishTypebot only once status is "success".',
  },
}
