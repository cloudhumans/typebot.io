import { sanitizeToolName } from './sanitizeToolName'
import type { WorkflowTool } from '../types'

/**
 * Transform a Typebot workflow tool to MCP tool format.
 *
 * The `_meta.isPublished` field is exposed so UI layers can render a
 * "not yet published" warning next to tools that were created but
 * haven't been published in the flow editor. Agents ignore this field
 * (and by default only receive published tools; see
 * `getWorkflowTools({ includeDrafts })`).
 */
export function transformToMCPTool(tool: WorkflowTool) {
  const properties: Record<string, { type: string; description: string }> = {}
  const required: string[] = []

  ;(tool.variables || []).forEach((v) => {
    if (v.name) {
      properties[v.name] = {
        type: 'string',
        description: v.description || `Input for ${v.name}`,
      }
      // Only mandatory inputs go into `required`. A variable declared as
      // optional in the editor (`required: false`) stays in `properties` but
      // out of `required`, so the agent may omit it instead of sending "".
      // `undefined`/`true` keeps the legacy default of mandatory.
      if (v.required !== false) required.push(v.name)
    }
  })

  return {
    name: sanitizeToolName(tool.name),
    description: tool.description || `Execute ${tool.name}`,
    inputSchema: {
      type: 'object' as const,
      properties,
      required,
    },
    annotations: {},
    _meta: {
      workflowId: tool.id,
      isPublished: tool.isPublished,
      createdAt: tool.createdAt.toISOString(),
      updatedAt: tool.updatedAt.toISOString(),
    },
  }
}
