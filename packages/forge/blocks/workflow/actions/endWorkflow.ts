import { createAction, option } from '@typebot.io/forge'

export const endWorkflow = createAction({
  name: 'Return Output',
  run: {
    server: ({ logs, options, lastEndpointResponse, variables }) => {
      const responseType = options.responseType ?? 'Last HTTP Response'
      let response: unknown
      if (
        responseType === 'Last HTTP Response' ||
        responseType === 'Last HTTP Request'
      ) {
        response = lastEndpointResponse
      } else if (options.customJson) {
        if (
          typeof options.customJson === 'object' &&
          options.customJson !== null
        ) {
          response = options.customJson
        } else if (typeof options.customJson === 'string') {
          const trimmed = options.customJson.trim()
          const jsonContent = trimmed.startsWith('```json')
            ? trimmed.replace(/^```json\n?/, '').replace(/\n?```$/, '')
            : trimmed
          try {
            response = JSON.parse(jsonContent)
          } catch {
            try {
              // Attempt to fix unquoted string values (common AI output)
              const fixedJson = jsonContent.replace(
                /:\s*(?!(true|false|null))([a-zA-Z_]\w*)(?=\s*[,}\]])/g,
                ': "$2"'
              )
              response = JSON.parse(fixedJson)
            } catch {
              response = options.customJson
            }
          }
        } else {
          response = options.customJson
        }
      }

      logs.add({
        status: 'success',
        description: 'Tool Output',
        details: {
          action: 'END_WORKFLOW',
          responseType,
          response,
        },
      })
    },
  },
  options: option.object({
    responseType: option
      .enum(['Last HTTP Response', 'Custom JSON', 'Last HTTP Request'])
      .layout({
        label: 'Response Type',
        defaultValue: 'Last HTTP Response',
        direction: 'row',
        hiddenItems: ['Last HTTP Request'],
      }),
    customJson: option.string.layout({
      label: 'Custom JSON',
      inputType: 'code',
      lang: 'json',
      accordion: 'Output config',
      isHidden: (options) => options.responseType !== 'Custom JSON',
    }),
  }),
})
