import { DebugVariable, SessionState, Variable } from '@typebot.io/schemas'
import { isDefined, isNotDefined } from '@typebot.io/lib/utils'
import { parseGuessedTypeFromString } from '@typebot.io/variables/parseGuessedTypeFromString'

// Variable values are text by the time they reach the session: every write goes
// through `safeStringify` in `updateVariablesInSession`, and the session schema
// only allows `string | (string | null)[]`. So `5`, `true` and `{ a: 1 }` are all
// stored as strings.
//
// Restoring them with `parseGuessedTypeFromString` is the same rule the engine
// applies wherever it needs a typed value (`deepParseVariables` with
// `guessCorrectTypes`). This is for *display*: it lets the panel show `{"a":1}`
// pretty-printed and a list as `["a", 4]` instead of `["a", "4"]`. The type
// reported in the table does not come from here — see `variableTypes` below,
// because guessing cannot tell a text input holding "5" from the number 5.
//
// Strings JSON can't parse stay strings, which keeps `007` and `+5511999999999`
// intact.
const restoreGuessedType = (value: Variable['value']): unknown => {
  if (isNotDefined(value)) return value
  if (Array.isArray(value))
    return value.map((item) =>
      isNotDefined(item) ? item : parseGuessedTypeFromString(item)
    )
  return parseGuessedTypeFromString(value)
}

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
      const value = restoreGuessedType(variable.value)
      return {
        id: variable.id,
        name: variable.name,
        value,
        // Falls back to the restored value's own type for variables this run
        // never wrote — prefilled ones, a resumed session, or a linked typebot's
        // own variables.
        type: capturedTypes?.[variable.id] ?? typeof value,
      }
    })
}
