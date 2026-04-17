/**
 * Workflow tool as returned by tool discovery.
 */
export interface WorkflowTool {
  id: string
  name: string
  tenant: string
  description: string
  isPublished: boolean
  variables: Array<{
    name?: string
    description?: string
  }>
  publicName: string
  /** Creation timestamp from the underlying Typebot row. */
  createdAt: Date
  /** Last-update timestamp from the underlying Typebot row. */
  updatedAt: Date
}

/**
 * Result from getWorkflowTools service.
 */
export interface GetWorkflowToolsResult {
  tools: WorkflowTool[]
}
