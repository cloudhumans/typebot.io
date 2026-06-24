/**
 * Human label for the `<workspace> - <event>` structured-log prefix.
 *
 * The workspace name is frequently absent in preview/embedded runs, which used
 * to render the prefix as a useless `unknown - ...`. Fall back to the workspace
 * id so the line still identifies the workspace; only when neither is available
 * do we emit the literal `'unknown'`.
 *
 * Accepts either the raw values (name possibly null/undefined) or an already
 * built `{ id, name }` log-context workspace where the name may already be the
 * `'unknown'` sentinel — both are treated as "no name".
 */
export const workspaceLogLabel = (workspace?: {
  id?: string | null
  name?: string | null
}): string => {
  const { id, name } = workspace ?? {}
  if (name && name !== 'unknown') return name
  if (id && id !== 'unknown') return id
  return 'unknown'
}
