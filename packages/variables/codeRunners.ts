import { Variable } from './types'
import ivm from 'isolated-vm'
import { parseGuessedValueType } from './parseGuessedValueType'
import logger from '@typebot.io/lib/logger'

export interface DisposableRunner {
  (code: string): unknown
  dispose: () => void
}

export const createCodeRunner = ({
  variables,
}: {
  variables: Variable[]
}): DisposableRunner => {
  const isolate = new ivm.Isolate()
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())
    // Safe helpers to avoid common runtime crashes in expressions
    context.evalSync(`
      globalThis.toStringSafe = function (value) {
        try { return String(value ?? ''); } catch { return ''; }
      };
      globalThis.splitSafe = function (value, sep) {
        try { return String(value ?? '').split(sep ?? ','); } catch { return []; }
      };
    `)
    variables.forEach((v) => {
      jail.setSync(
        v.id,
        parseTransferrableValue(parseGuessedValueType(v.value))
      )
    })
    const runner = (code: string) => {
      try {
        // Add header lines to improve stack offsets and debugging
        const wrappedCode =
          `\n\n/* typebot:codeRunner:start */\n` +
          code +
          `\n/* typebot:codeRunner:end */`
        return context.evalClosureSync(
          `return (function() {
    const Fn = new Function($0);
    return Fn();
  }())`,
          [wrappedCode],
          { result: { copy: true }, timeout: 10000 }
        )
      } catch (err) {
        logger.error('createCodeRunner execution error', {
          codePreview: code.slice(0, 400),
          variables: variables.map((v) => ({
            id: v.id,
            name: v.name,
            type: typeof v.value,
          })),
          hasSplitPattern: /\.split\(/.test(code),
          error:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
        })
        throw err
      }
    }
    ;(runner as any).dispose = () => isolate.dispose()
    return runner as DisposableRunner
  } catch (err) {
    isolate.dispose()
    throw err
  }
}

export const createHttpReqResponseMappingRunner = (
  response: any
): DisposableRunner => {
  const isolate = new ivm.Isolate()
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())
    jail.setSync('response', new ivm.ExternalCopy(response).copyInto())
    const runner = (expression: string) => {
      try {
        return context.evalClosureSync(
          `globalThis.evaluateExpression = function(expression) {
        try {
          // Use Function to safely evaluate the expression
          const func = new Function('statusCode', 'data', 'return (' + expression + ')');
          return func(response.statusCode, response.data);
        } catch (err) {
          throw new Error('Invalid expression: ' + err.message);
        }
      };
      return evaluateExpression.apply(null, arguments);`,
          [expression],
          {
            result: { copy: true },
            timeout: 10000,
          }
        )
      } catch (err) {
        logger.error('createHttpReqResponseMappingRunner evaluation error', {
          expressionPreview: expression.slice(0, 400),
          responseMeta: {
            hasStatusCode: !!response?.statusCode,
            dataType: typeof response?.data,
          },
          error:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
        })
        throw err
      }
    }
    ;(runner as any).dispose = () => isolate.dispose()
    return runner as DisposableRunner
  } catch (err) {
    isolate.dispose()
    throw err
  }
}

export const parseTransferrableValue = (value: unknown) => {
  if (typeof value === 'object') {
    return new ivm.ExternalCopy(value).copyInto()
  }
  return value
}
