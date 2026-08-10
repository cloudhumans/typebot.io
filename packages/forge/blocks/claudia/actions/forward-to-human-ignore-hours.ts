import { createAction, option } from '@typebot.io/forge'
import { createClaudiaResponseLog } from '../helpers/createClaudiaResponseLog'

export const forwardToHumanIgnoreHours = createAction({
  name: 'Forward to Human [N2] (ignore office hours)',
  run: {
    server: ({ logs, options }) => {
      const log = createClaudiaResponseLog({
        action: 'FORWARD_TO_HUMAN_IGNORE_HOURS',
        topic: options.topic,
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
  }),
})
