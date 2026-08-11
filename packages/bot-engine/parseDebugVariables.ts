import { DebugVariable, SessionState, Variable } from '@typebot.io/schemas'
import { isDefined, isNotDefined } from '@typebot.io/lib/utils'
import { parseGuessedTypeFromString } from '@typebot.io/variables/parseGuessedTypeFromString'

// Variable values are text by the time they reach the session: every write goes
// through `safeStringify` in `updateVariablesInSession`, and the session schema
// only allows `string | (string | null)[]`. So `5`, `true` and `{ a: 1 }` are all
// stored as strings, and the debug panel — which reads the type off the value
// with `typeof` — could only ever answer "String" or "List".
//
// Restoring the type with `parseGuessedTypeFromString` is the same rule the
// engine applies wherever it needs a typed value (`deepParseVariables` with
// `guessCorrectTypes`), so the panel reports what the flow itself sees
// downstream. List items are restored one by one, mirroring how
// `deepParseVariables` recurses into arrays.
//
// It cannot tell a text input holding "5" from the number 5 — that information
// no longer exists anywhere once the value is stored. Strings JSON can't parse
// stay strings, which is what keeps `007` and `+5511999999` intact.
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
export const parseDebugVariables = (state: SessionState): DebugVariable[] =>
  (state.typebotsQueue.at(0)?.typebot.variables ?? [])
    .filter((variable) => isDefined(variable.value))
    .map((variable) => ({
      id: variable.id,
      name: variable.name,
      value: restoreGuessedType(variable.value),
    }))
