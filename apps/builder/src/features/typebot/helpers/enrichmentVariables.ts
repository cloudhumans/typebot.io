import { createId } from '@paralleldrive/cuid2'
import { Variable } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { EventType } from '@typebot.io/schemas/features/events/constants'
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

export const ENRICHMENT_VARIABLES_GROUP_TITLE =
  'Variáveis pré-preenchidas pela ClaudIA'

const ENRICHMENT_VARIABLE_DESCRIPTION = 'Pré-preenchida pela ClaudIA'

type BlockLike = {
  id: string
  type?: string
  options?: unknown
  outgoingEdgeId?: string
}

type GroupLike = {
  id: string
  title: string
  graphCoordinates: { x: number; y: number }
  blocks: BlockLike[]
}

type EdgeLike = {
  id: string
  from: { blockId?: string; eventId?: string }
  to: { groupId?: string; blockId?: string }
}

const isDeclareVariablesBlock = (block: BlockLike) =>
  block.type === LogicBlockType.DECLARE_VARIABLES

export const normalizeEnrichmentDeclareVariables = <
  G extends GroupLike,
  E extends EdgeLike
>({
  groups,
  edges,
  variables,
}: {
  groups: G[]
  edges: E[]
  variables: Pick<Variable, 'id' | 'name'>[]
}): { groups: G[]; edges: E[] } => {
  const canonicalOptions = {
    variables: contextEnrichmentBuiltInVariables.flatMap((name) => {
      const variable = variables.find((v) => v.name === name)
      return variable
        ? [
            {
              variableId: variable.id,
              description: ENRICHMENT_VARIABLE_DESCRIPTION,
              required: false,
            },
          ]
        : []
    }),
  }

  const declareBlockIds = new Set(
    groups.flatMap((group) =>
      group.blocks.filter(isDeclareVariablesBlock).map((block) => block.id)
    )
  )

  const carrierGroup = groups.find(
    (group) =>
      group.blocks.length > 0 && group.blocks.every(isDeclareVariablesBlock)
  )

  const canonicalBlock = {
    id: carrierGroup?.blocks[0].id ?? createId(),
    type: LogicBlockType.DECLARE_VARIABLES,
    options: canonicalOptions,
    ...(carrierGroup?.blocks[0].outgoingEdgeId
      ? { outgoingEdgeId: carrierGroup.blocks[0].outgoingEdgeId }
      : {}),
  }

  const strippedGroups = groups.map((group) =>
    group.id === carrierGroup?.id
      ? { ...group, blocks: [canonicalBlock] }
      : {
          ...group,
          blocks: group.blocks.filter((b) => !isDeclareVariablesBlock(b)),
        }
  )

  const finalGroups = carrierGroup
    ? strippedGroups
    : [
        ...strippedGroups,
        {
          id: createId(),
          title: ENRICHMENT_VARIABLES_GROUP_TITLE,
          graphCoordinates: { x: -320, y: 0 },
          blocks: [canonicalBlock],
        } as unknown as G,
      ]

  const removedDeclareBlockIds = new Set(
    [...declareBlockIds].filter((id) => id !== canonicalBlock.id)
  )

  const finalEdges = edges.filter(
    (edge) =>
      !(edge.from.blockId && removedDeclareBlockIds.has(edge.from.blockId))
  )

  return { groups: finalGroups, edges: finalEdges }
}

export const ENRICHMENT_STARTER_GROUP_TITLE = 'Retorna contexto do CRM'

export const ENRICHMENT_STARTER_CUSTOM_JSON = JSON.stringify(
  {
    cliente: '{{contactName}}',
    email: '{{contactEmail}}',
    telefone: '{{contactPhone}}',
    id_crm: '{{contactExternalId}}',
    exemplo: 'Substitua este JSON pelo retorno real do seu CRM',
  },
  null,
  2
)

export const buildEnrichmentStarterFlow = () => {
  const eventId = createId()
  const startEdgeId = createId()
  const declareGroupId = createId()
  const declareBlockId = createId()
  const outputEdgeId = createId()
  const outputGroupId = createId()
  return {
    events: [
      {
        id: eventId,
        type: EventType.START,
        outgoingEdgeId: startEdgeId,
        graphCoordinates: { x: 0, y: 0 },
      },
    ],
    edges: [
      {
        id: startEdgeId,
        from: { eventId },
        to: { groupId: declareGroupId },
      },
      {
        id: outputEdgeId,
        from: { blockId: declareBlockId },
        to: { groupId: outputGroupId },
      },
    ],
    groups: [
      {
        id: declareGroupId,
        title: ENRICHMENT_VARIABLES_GROUP_TITLE,
        graphCoordinates: { x: 350, y: 0 },
        blocks: [
          {
            id: declareBlockId,
            type: LogicBlockType.DECLARE_VARIABLES,
            options: { variables: [] },
            outgoingEdgeId: outputEdgeId,
          },
        ],
      },
      {
        id: outputGroupId,
        title: ENRICHMENT_STARTER_GROUP_TITLE,
        graphCoordinates: { x: 750, y: 0 },
        blocks: [
          {
            id: createId(),
            type: 'workflow',
            options: {
              action: 'Return Output',
              responseType: 'Custom JSON',
              customJson: ENRICHMENT_STARTER_CUSTOM_JSON,
            },
          },
        ],
      },
    ],
  }
}
