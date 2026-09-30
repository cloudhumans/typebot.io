import { DebugVariable, SessionState, Variable } from '@typebot.io/schemas'
import { isDefined } from '@typebot.io/lib/utils'
import { parseGuessedTypeFromString } from '@typebot.io/variables/parseGuessedTypeFromString'

// Values reach the session as text (`safeStringify` in `updateVariablesInSession`)
// and the type is captured separately, so nothing here needs to guess a type —
// see `previewMetadata.variableTypes`.
//
// The one thing worth undoing is `JSON.stringify` on an object: parsing that back
// is its exact inverse, and it is what lets the panel pretty-print the value in
// the "view all" modal instead of dumping raw JSON. Everything else is shown
// exactly as stored, so the value can never contradict the reported type:
//   - numbers and booleans render identically either way (`String(5)` ===
//     `String('5')`), so parsing them buys nothing
//   - a list is stored item-wise as text, and that is also what a Code block
//     reading it back receives, so `["a", "4"]` is the truthful display
//   - a string stays a string, so text that happens to be valid JSON — `null`,
//     `undefined`, `5`, `{"a":1}` — is shown as typed instead of being silently
//     converted into a different value (or into a blank one)
const parseForDisplay = (value: Variable['value'], type: string): unknown =>
  type === 'object' && typeof value === 'string'
    ? parseGuessedTypeFromString(value)
    : value

// `typeof` of the value as stored, for variables this run never wrote: prefilled
// ones, a resumed session, or a linked typebot's own variables. The session only
// ever holds text or a list of text, so this answers 'string' or 'object' — which
// is all that is actually known about them. Deriving it from a reinterpreted
// value instead would report `number` for a text input holding "5".
const storedValueType = (value: Variable['value']): string =>
  Array.isArray(value) ? 'object' : typeof value

// Snapshot of the filled variables for the builder debug panel. The
// `isDefined(value)` filter is the panel's contract — it only ever lists
// variables that actually hold a value — so it lives in one place instead of
// being repeated at every call site.
export const parseDebugVariables = (state: SessionState): DebugVariable[] => {
  // Captured by `updateVariablesInSession` on every write, so it describes the
  // value each variable holds right now.
  const capturedTypes = state.previewMetadata?.variableTypes

  return (state.typebotsQueue.at(0)?.typebot.variables ?? [])
    .filter((variable) => isDefined(variable.value))
    .map((variable) => {
      const type =
        capturedTypes?.[variable.id] ?? storedValueType(variable.value)
      return {
        id: variable.id,
        name: variable.name,
        value: parseForDisplay(variable.value, type),
        type,
      }
    })
}
