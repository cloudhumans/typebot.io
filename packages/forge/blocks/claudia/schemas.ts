// Do not edit this file manually
import { parseBlockCredentials, parseBlockSchema } from '@typebot.io/forge'
import { claudiaBlock } from '.'

export const claudiaBlockSchema = parseBlockSchema(claudiaBlock)
export const claudiaCredentialsSchema = parseBlockCredentials(claudiaBlock)