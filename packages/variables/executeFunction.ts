import { parseVariables } from './parseVariables'
import { extractVariablesFromText } from './extractVariablesFromText'
import { parseGuessedValueType } from './parseGuessedValueType'
import { isDefined } from '@typebot.io/lib'
import { safeStringify } from '@typebot.io/lib/safeStringify'
import { Variable } from './types'
import ivm from 'isolated-vm'
import { parseTransferrableValue } from './codeRunners'
import jwt from 'jsonwebtoken'
import logger from '@typebot.io/lib/logger'

const defaultTimeout = 10 * 1000

type Props = {
  variables: Variable[]
  body: string
  args?: Record<string, unknown>
  metadata?: {
    typebotId?: string
    blockId?: string
    resultId?: string
    origin?: 'viewer' | 'builder' | 'api'
  }
}

export const executeFunction = async ({
  variables,
  body,
  args: initialArgs,
  metadata,
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

    // Provide safe helpers to avoid crashes in user scripts
    context.evalSync(`
      globalThis.toStringSafe = function (value) {
        try { return String(value ?? ''); } catch { return ''; }
      };
      globalThis.splitSafe = function (value, sep) {
        try { return String(value ?? '').split(sep ?? ','); } catch { return []; }
      };
    `)

    args.forEach(({ id, value }) => {
      jail.setSync(id, parseTransferrableValue(value))
    })
    const run = (code: string) => {
      const wrappedCode =
        `\n\n/* typebot:executeFunction:start */\n` +
        code +
        `\n/* typebot:executeFunction:end */`
      return context.evalClosure(
        `return (async function() {
      const AsyncFunction = async function () {}.constructor;
      const Fn = new AsyncFunction($0);
      return Fn();
    }())`,
        [wrappedCode],
        { result: { copy: true, promise: true }, timeout: defaultTimeout }
      )
    }

    const output = await run(parsedBody)
    logger.info('executeFunction output', {
      origin: metadata?.origin ?? 'viewer',
      typebotId: metadata?.typebotId,
      blockId: metadata?.blockId,
      resultId: metadata?.resultId,
      outputPreview:
        typeof output === 'string'
          ? output.slice(0, 200)
          : safeStringify(output)?.slice(0, 200),
    })
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
    logger.error('Error while executing script', {
      origin: metadata?.origin ?? 'viewer',
      typebotId: metadata?.typebotId,
      blockId: metadata?.blockId,
      resultId: metadata?.resultId,
      codePreview: parsedBody.slice(0, 400),
      variables: variables.map((v) => ({
        id: v.id,
        name: v.name,
        type: typeof v.value,
      })),
      hasSplitPattern: /\.split\(/.test(parsedBody),
      error:
        typeof e === 'string'
          ? e
          : e instanceof Error
          ? { message: e.message, stack: e.stack }
          : e,
    })

    const error =
      typeof e === 'string'
        ? e
        : e instanceof Error
        ? e.message
        : JSON.stringify(e)

    return {
      error,
      output: error,
    }
  } finally {
    isolate.dispose()
  }
}
