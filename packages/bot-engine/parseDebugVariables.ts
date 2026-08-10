import { DebugVariable, SessionState } from '@typebot.io/schemas'
import { isDefined } from '@typebot.io/lib/utils'

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
      value: variable.value,
    }))
