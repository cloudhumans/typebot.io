import { parseVariables } from './parseVariables'
import { extractVariablesFromText } from './extractVariablesFromText'
import { parseGuessedValueType } from './parseGuessedValueType'
import { isDefined } from '@typebot.io/lib'
import { safeStringify } from '@typebot.io/lib/safeStringify'
import { Variable } from './types'
import ivm from 'isolated-vm'
import { parseTransferrableValue } from './codeRunners'
import jwt from 'jsonwebtoken'
// Datadog tracing context capture (improved): capture active span at invocation time
// rather than at module load (previous approach yielded null IDs because no span existed yet).
import {
  getTracer,
  getCorrelation,
  withSpan,
} from '@typebot.io/lib/trpc/datadogCore'
// Legacy helper functions kept for backward compatibility in other modules
import {
  getActiveSpan,
  tagSpan,
  extractTraceIds,
} from '@typebot.io/lib/trpc/datadogUtils'

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
  // Capture active span at invocation time (module load may have occurred before any request span existed)
  const tracer = getTracer() as any
  const parentSpan = getActiveSpan() as any
  // Use core correlation with synthetic fallback so logs never show null IDs
  const { traceId: initialTraceId, spanId: initialSpanId } = getCorrelation({
    syntheticFallback: true,
  })
  // We'll optionally create a span; if none, reuse synthetic IDs
  let sandboxSpan: any = null
  let ddTraceId = initialTraceId
  let ddSpanId = initialSpanId
  if (tracer && typeof tracer.startSpan === 'function') {
    try {
      sandboxSpan = tracer.startSpan('variables.executeFunction', {
        childOf: parentSpan || undefined,
      })
      tagSpan(sandboxSpan, {
        'variables.count': variables.length,
        'code.length': body.length,
      })
      // Replace synthetic IDs with real ones if available
      const ctxIds = extractTraceIds(sandboxSpan)
      ddTraceId = ctxIds.traceId || ddTraceId
      ddSpanId = ctxIds.spanId || ddSpanId
    } catch {
      sandboxSpan = null
    }
  }
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
    if (sandboxSpan) {
      try {
        tagSpan(sandboxSpan, { 'sandbox.status': 'ok' })
      } catch {}
    }
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
    if (sandboxSpan) {
      try {
        tagSpan(sandboxSpan, {
          error: 1,
          'error.msg': e instanceof Error ? e.message : String(e),
        })
      } catch {}
    }

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
    try {
      sandboxSpan?.finish?.()
    } catch {}
  }
}
