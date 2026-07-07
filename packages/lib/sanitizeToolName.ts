/**
 * Normalize a tool name to be MCP-compliant.
 * MCP tool names must be lowercase, URL-safe, without spaces.
 */
export function sanitizeToolName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_{2,}/g, '_')
      // Previous step collapsed `_{2,}` to a single `_`, so edges hold at most one
      // underscore — matching without a quantifier avoids backtracking (Sonar S8786).
      .replace(/^_|_$/g, '')
  )
}
