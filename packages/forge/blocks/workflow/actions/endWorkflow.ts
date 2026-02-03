import { createAction, option } from '@typebot.io/forge'

export const endWorkflow = createAction({
  name: 'End Workflow',
  run: {
    server: ({ logs, options, lastEndpointResponse }) => {
      let response: unknown
      if (
        options.responseType === 'Last HTTP Response' ||
        options.responseType === 'Last HTTP Request'
      ) {
        response = lastEndpointResponse
      } else if (options.customJson) {
        try {
          response = JSON.parse(options.customJson)
        } catch {
          response = options.customJson
        }
      }

      logs.add({
        status: 'success',
        description: 'Workflow End',
        details: {
          action: 'END_WORKFLOW',
          responseType: options.responseType,
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
