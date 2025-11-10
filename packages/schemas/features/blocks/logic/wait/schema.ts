import { z } from '../../../../zod'
import { blockBaseSchema } from '../../shared'
import { LogicBlockType } from '../constants'

export const waitOptionsSchema = z.object({
  secondsToWaitFor: z
    .string()
    .transform((val) => {
      const parsed = parseFloat(val)
      if (isNaN(parsed)) return undefined
      return Math.min(parsed, 30).toString()
    })
    .optional(),
  shouldPause: z.boolean().optional(),
})

export const waitBlockSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([LogicBlockType.WAIT]),
    options: waitOptionsSchema.optional(),
  })
)

export type WaitBlock = z.infer<typeof waitBlockSchema>
