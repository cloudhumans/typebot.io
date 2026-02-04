import { TRPCError } from '@trpc/server'
import { startSession } from '../startSession'
import { saveStateToDatabase } from '../saveStateToDatabase'
import { Typebot, DeclareVariablesBlock } from '@typebot.io/schemas'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import logger from '@typebot.io/lib/logger'
import { isDefined } from '@typebot.io/lib/utils'

type Props = {
  publicId: string
  prefilledVariables?: Record<string, unknown>
  resultId?: string
}

export type RequiredInput = {
  name: string
  description: string
  required: boolean
}

export const startChatForAgent = async ({
  publicId,
  prefilledVariables,
  resultId,
}: Props) => {
  logger.info('startChatForAgent called', {
    publicId,
    hasPrefilledVariables: !!prefilledVariables,
    providedVariableCount: Object.keys(prefilledVariables ?? {}).length,
  })

  const {
    typebot,
    messages,
    newSessionState,
    resultId: sessionResultId,
    input,
    logs,
    clientSideActions,
    visitedEdges,
    setVariableHistory,
  } = await startSession({
    version: 2,
    startParams: {
      type: 'live',
      isOnlyRegistering: false,
      isStreamEnabled: false,
      publicId,
      prefilledVariables,
      resultId,
      textBubbleContentFormat: 'markdown',
    },
  })

  // Extract required inputs from DECLARE_VARIABLES blocks
  const requiredInputs = extractRequiredInputs(typebot)

  logger.info('Extracted required inputs', {
    publicId,
    requiredInputCount: requiredInputs.length,
    requiredInputs: requiredInputs.map((i) => ({
      name: i.name,
      required: i.required,
    })),
  })

  // Validate that all required inputs were provided
  const missingInputs = validateRequiredInputs(
    requiredInputs,
    prefilledVariables
  )

  if (missingInputs.length > 0) {
    logger.warn('Missing required inputs', {
      publicId,
      missingInputs: missingInputs.map((i) => i.name),
    })
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Missing required input variables: ${missingInputs.map((i) => i.name).join(', ')}`,
      cause: {
        missingInputs: missingInputs.map((input) => ({
          name: input.name,
          description: input.description,
        })),
      },
    })
  }

  const session = await saveStateToDatabase({
    session: { state: newSessionState },
    input,
    logs,
    clientSideActions,
    visitedEdges,
    setVariableHistory,
    hasCustomEmbedBubble: false,
  })

  logger.info('Agent chat session created', {
    publicId,
    sessionId: session.id,
    providedInputCount: Object.keys(prefilledVariables ?? {}).length,
    requiredInputCount: requiredInputs.filter((i) => i.required).length,
  })

  const toolOutputLog = logs?.find(
    (log) => log.details && (log.details as any).action === 'END_WORKFLOW'
  )
  const toolOutput = toolOutputLog
    ? (toolOutputLog.details as any).response
    : undefined

  return {
    sessionId: session.id,
    typebotId: typebot.id,
    resultId: sessionResultId,
    messages,
    input,
    logs,
    toolOutput,
    requiredInputs,
    providedInputs: Object.keys(prefilledVariables ?? {}),
  }
}

function extractRequiredInputs(typebot: Typebot): RequiredInput[] {
  const declareBlocks = typebot.groups
    .flatMap((g) => g.blocks)
    .filter(
      (b): b is DeclareVariablesBlock =>
        b.type === LogicBlockType.DECLARE_VARIABLES
    )

  const inputs: RequiredInput[] = []

  for (const block of declareBlocks) {
    const variables = block.options?.variables ?? []
    for (const v of variables) {
      const variable = typebot.variables.find((v2) => v2.id === v.variableId)
      if (variable) {
        inputs.push({
          name: variable.name,
          description: v.description,
          required: v.required ?? true,
        })
      }
    }
  }

  return inputs
}

function validateRequiredInputs(
  requiredInputs: RequiredInput[],
  provided?: Record<string, unknown>
): RequiredInput[] {
  if (!provided) return requiredInputs.filter((input) => input.required)
  return requiredInputs
    .filter((input) => input.required)
    .filter((input) => {
      const byName = provided[input.name]
      return !isDefined(byName)
    })
}
