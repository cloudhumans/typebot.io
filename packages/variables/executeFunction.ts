import { parseVariables } from './parseVariables'
import { extractVariablesFromText } from './extractVariablesFromText'
import { parseGuessedValueType } from './parseGuessedValueType'
import { isDefined } from '@typebot.io/lib'
import logger from '@typebot.io/lib/logger'
import { safeStringify } from '@typebot.io/lib/safeStringify'
import { Variable } from './types'
import ivm from 'isolated-vm'
import { parseTransferrableValue } from './codeRunners'
import jwt from 'jsonwebtoken'

const defaultTimeout = 10 * 1000
const valuePreviewMaxChars = 200
const bodyPreviewMaxChars = 600

export type ExecuteFunctionContext = {
  typebotId?: string
  typebotName?: string
  sessionId?: string
  workspaceId?: string
  workspaceName?: string
  blockId?: string
  blockType?: string
  source?: string
}

type Props = {
  variables: Variable[]
  body: string
  args?: Record<string, unknown>
  errorContext?: ExecuteFunctionContext
}

const previewValue = (value: unknown): string => {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  let str: string
  if (typeof value === 'string') str = value
  else {
    try {
      str = JSON.stringify(value) ?? String(value)
    } catch {
      str = String(value)
    }
  }
  return str.length > valuePreviewMaxChars
    ? `${str.slice(0, valuePreviewMaxChars)}…(+${str.length - valuePreviewMaxChars} chars)`
    : str
}

export const executeFunction = async ({
  variables,
  body,
  args: initialArgs,
  errorContext,
}: Props) => {
  const parsedBody = parseVariables(variables, {
    fieldToParse: 'id',
  })(body)

  const args = (
    extractVariablesFromText(variables)(body).map((variable) => ({
      id: variable.id,
      value: parseGuessedValueType(variable.value),
    })) as { id: string; value: unknown }[]
  ).concat(
    initialArgs
      ? Object.entries(initialArgs).map(([id, value]) => ({ id, value }))
      : []
  )

  let updatedVariables: Record<string, any> = {}

  const setVariable = (key: string, value: any) => {
    updatedVariables[key] = value
  }

  const isolate = new ivm.Isolate()
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())
    context.evalClosure(
      'globalThis.setVariable = (...args) => $0.apply(undefined, args, { arguments: { copy: true }, promise: true, result: { copy: true, promise: true } })',
      [new ivm.Reference(setVariable)]
    )
    context.evalClosure(
      'globalThis.fetch = (...args) => $0.apply(undefined, args, { arguments: { copy: true }, promise: true, result: { copy: true, promise: true } })',
      [
        new ivm.Reference(async (...args: any[]) => {
          // @ts-ignore
          const response = await fetch(...args)
          return response.text()
        }),
      ]
    )

    context.evalClosure(
      'globalThis.jwtSign = (...args) => $0.apply(undefined, args, { arguments: { copy: true }, promise: true, result: { copy: true, promise: true } })',
      [
        new ivm.Reference((...args: any[]) => {
          // @ts-ignore
          return jwt.sign(...args)
        }),
      ]
    )

    args.forEach(({ id, value }) => {
      jail.setSync(id, parseTransferrableValue(value))
    })
    const run = (code: string) =>
      context.evalClosure(
        `return (async function() {
      const AsyncFunction = async function () {}.constructor;
      return new AsyncFunction($0)();
    }())`,
        [code],
        { result: { copy: true, promise: true }, timeout: defaultTimeout }
      )

    const output = await run(parsedBody)
    console.log('Output', output)
    return {
      output: safeStringify(output) ?? '',
      newVariables: Object.entries(updatedVariables)
        .map(([name, value]) => {
          const existingVariable = variables.find((v) => v.name === name)
          if (!existingVariable) return
          return {
            id: existingVariable.id,
            name: existingVariable.name,
            value,
          }
        })
        .filter(isDefined),
    }
  } catch (e) {
    const error =
      typeof e === 'string'
        ? e
        : e instanceof Error
          ? e.message
          : JSON.stringify(e)

    const variablePreview = args.reduce<Record<string, string>>(
      (acc, { id, value }) => {
        const variable = variables.find((v) => v.id === id)
        const name = variable?.name ?? id
        acc[name] = previewValue(value)
        return acc
      },
      {}
    )

    logger.error('Error while executing script', {
      ...errorContext,
      error: {
        name: e instanceof Error ? e.name : 'Unknown',
        message: error,
        stack: e instanceof Error ? e.stack : undefined,
      },
      bodyPreview:
        body.length > bodyPreviewMaxChars
          ? `${body.slice(0, bodyPreviewMaxChars)}…(+${body.length - bodyPreviewMaxChars} chars)`
          : body,
      variables: variablePreview,
    })

    return {
      error,
      output: error,
    }
  } finally {
    isolate.dispose()
  }
}
