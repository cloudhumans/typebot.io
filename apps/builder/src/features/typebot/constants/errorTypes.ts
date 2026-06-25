import { z } from 'zod'

export const errorTypeEnum = z.enum([
  'conditionalBlocks',
  'missingTextBeforeClaudia',
  'brokenLinks',
  'missingTextBetweenInputBlocks',
  'missingClaudiaInFlowBranches',
  'missingWorkflowEndInFlowBranches',
  'missingCredential',
  'deprecatedCredential',
])
export type ErrorType = z.infer<typeof errorTypeEnum>

// Items default to blocking 'error' severity. 'warning' items surface in the UI
// but do not flip `isValid`, so they never block publishing (e.g. a deprecated
// credential that still resolves at runtime).
export const errorSeverityEnum = z.enum(['error', 'warning'])
export type ErrorSeverity = z.infer<typeof errorSeverityEnum>

const validationErrorItemSchema = z.object({
  groupId: z.string().optional(),
  type: errorTypeEnum,
  severity: errorSeverityEnum.optional(),
  message: z.string().optional(),
})

export const validationErrorSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(validationErrorItemSchema),
})

export type ValidationErrorItem = z.infer<typeof validationErrorItemSchema>
export type ValidationErrorItemWithGroupName = ValidationErrorItem & {
  groupName: string
}
export type ValidationError = z.infer<typeof validationErrorSchema>
