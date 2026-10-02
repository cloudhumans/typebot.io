import type * as Winston from 'winston'
import { applyDatadogError } from './datadogError'

export const createLogFormat = (winston: typeof Winston, pretty: boolean) => {
  const baseFormats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format(applyDatadogError)(),
  ]

  const prettyFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, stack, ...rest } = info
      const restStr = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''
      return `${stack ? stack : message}${restStr}`
    })
  )

  return winston.format.combine(
    ...baseFormats,
    pretty ? prettyFormat : winston.format.json()
  )
}
