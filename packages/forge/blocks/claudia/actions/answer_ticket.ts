import { createAction, option } from '@typebot.io/forge'
import { createClaudiaResponseLog } from '../helpers/createClaudiaResponseLog'

export const answerTicket = createAction({
  name: 'Answer Ticket [N1]',
  run: {
    server: ({ logs, options }) => {
      const log = createClaudiaResponseLog({
        action: 'ANSWER_TICKET',
        topic: options.topic,
        searchTerm: options.searchTerm,
        tag: options.tag,
      })
      logs.add(log)
    },
  },
  options: option.object({
    topic: option.string.layout({
      label: 'Topic',
      placeholder: 'e.g. PAYMENT',
      accordion: 'Advanced settings',
    }),
    searchTerm: option
      .enum(['lastUserMessages', 'firstUserMessage', 'userMessages'])
      .layout({
        label: 'Search Term',
        accordion: 'Advanced settings',
        defaultValue: 'lastUserMessages',
      }),
    tag: option.string.layout({
      label: 'Tag',
      placeholder: 'e.g. caso_proativo_mat',
      accordion: 'Advanced settings',
      moreInfoTooltip:
        'Pins the ClaudIA conversation tag. On most channels it is written to the helpdesk as-is, so spelling matters — a typo creates a new tag rather than being ignored. Cannot contain commas. Accepts {{variables}}.',
    }),
  }),
})
