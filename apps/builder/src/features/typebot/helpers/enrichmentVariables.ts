import { createId } from '@paralleldrive/cuid2'
import { Variable } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { contextEnrichmentBuiltInVariables } from '@typebot.io/schemas/features/typebot/settings/constants'

export const findMissingEnrichmentBuiltIns = (
  variables: Pick<Variable, 'name'>[]
): string[] => {
  const names = new Set(variables.map((v) => v.name))
  return contextEnrichmentBuiltInVariables.filter((name) => !names.has(name))
}

export const withBuiltInEnrichmentVariables = (
  variables: Variable[]
): Variable[] => [
  ...findMissingEnrichmentBuiltIns(variables).map((name) => ({
    id: createId(),
    name,
  })),
  ...variables,
]

export const hasDeclareVariablesBlock = (
  groups: { blocks?: { type?: string }[] }[] | undefined
): boolean =>
  groups?.some((group) =>
    group.blocks?.some(
      (block) => block.type === LogicBlockType.DECLARE_VARIABLES
    )
  ) ?? false
