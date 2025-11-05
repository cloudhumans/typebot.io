import { parseVariables } from './parseVariables'
import { extractVariablesFromText } from './extractVariablesFromText'
import { parseGuessedValueType } from './parseGuessedValueType'
import { isDefined } from '@typebot.io/lib'
import { safeStringify } from '@typebot.io/lib/safeStringify'
import { Variable } from './types'
import ivm from 'isolated-vm'
import { parseTransferrableValue } from './codeRunners'
import jwt from 'jsonwebtoken'
// Datadog tracing context capture (best effort; isolate breaks async context)
// Prevent client bundle from including 'dd-trace' (Node-only) by using indirect require.
// Avoids "Module not found: Can't resolve 'fs'" errors in Next.js client builds.
let ddTraceId: string | null = null
let ddSpanId: string | null = null
const isNodeRuntime =
  typeof window === 'undefined' && typeof process !== 'undefined'
if (isNodeRuntime) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval,@typescript-eslint/no-var-requires
    const tracer = (Function('return require')()('dd-trace') as any)?.tracer
    const scope = tracer?.scope?.()
    const span = scope?.active?.()
    const ctx = span?.context?.()
    if (ctx) {
      if (typeof ctx.toTraceId === 'function') ddTraceId = ctx.toTraceId()
      if (typeof ctx.toSpanId === 'function') ddSpanId = ctx.toSpanId()
    }
  } catch {
    // silent: dd-trace optional
  }
}

const defaultTimeout = 10 * 1000

type Props = {
  variables: Variable[]
  body: string
  args?: Record<string, unknown>
}

export const executeFunction = async ({
  variables,
  body,
  args: initialArgs,
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

  try {
    const output = await run(parsedBody)
    // Structured log with Datadog correlation fields retained even after isolate context loss
    console.log(
      JSON.stringify({
        event: 'sandbox_output',
        dd: { trace_id: ddTraceId, span_id: ddSpanId },
        output,
      })
    )
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
    console.log(
      JSON.stringify({
        event: 'sandbox_error',
        dd: { trace_id: ddTraceId, span_id: ddSpanId },
        error: e instanceof Error ? e.message : String(e),
      })
    )
    console.error(e)

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
  }
}
