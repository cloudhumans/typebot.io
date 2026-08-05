import { createAction, option } from '@typebot.io/forge'
import { createClaudiaResponseLog } from '../helpers/createClaudiaResponseLog'

export const closeTicket = createAction({
  name: 'Close Ticket [N1]',
  run: {
    server: ({ logs, options }) => {
      const log = createClaudiaResponseLog({
        action: 'CLOSE_TICKET',
        tag: options.tag,
      })
      logs.add(log)
    },
  },
  options: option.object({
    tag: option.string.layout({
      label: 'Tag',
      placeholder: 'e.g. caso_proativo_mat',
      accordion: 'Advanced settings',
    }),
  }),
})
