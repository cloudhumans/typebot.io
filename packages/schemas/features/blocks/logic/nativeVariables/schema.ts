import { z } from 'zod'
import { optionBaseSchema, blockBaseSchema } from '../../shared'
import { LogicBlockType } from '../constants'

export const nativeVariablesOptionsSchema = optionBaseSchema.merge(
  z.object({
    nativeType: z
      .enum([
        'helpdeskId',
        'cloudChatId',
        'activeIntent',
        'channelType',
        'createdAt',
        'lastUserMessages',
        'messages',
      ])
      .optional(),
    variableId: z.string().optional(),
  })
)

export const nativeVariablesBlockSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([LogicBlockType.NATIVE_VARIABLES]),
    options: nativeVariablesOptionsSchema.optional(),
  })
)

export type NativeVariablesOptions = z.infer<
  typeof nativeVariablesOptionsSchema
>
export type NativeVariablesBlock = z.infer<typeof nativeVariablesBlockSchema>
