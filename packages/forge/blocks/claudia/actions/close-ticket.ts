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
      moreInfoTooltip:
        'Pins the ClaudIA conversation tag. On most channels it is written to the helpdesk as-is, so spelling matters — a typo creates a new tag rather than being ignored. Cannot contain commas. Accepts {{variables}}.',
    }),
  }),
})
