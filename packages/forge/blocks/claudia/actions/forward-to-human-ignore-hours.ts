import { createAction, option } from '@typebot.io/forge'
import { createClaudiaResponseLog } from '../helpers/createClaudiaResponseLog'

export const forwardToHumanIgnoreHours = createAction({
  name: 'Forward to Human [N2] (ignore office hours)',
  run: {
    server: ({ logs, options }) => {
      const log = createClaudiaResponseLog({
        action: 'FORWARD_TO_HUMAN_IGNORE_HOURS',
        topic: options.topic,
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
    tag: option.string.layout({
      label: 'Tag',
      placeholder: 'e.g. caso_proativo_mat',
      accordion: 'Advanced settings',
      moreInfoTooltip:
        'Pins the ClaudIA conversation tag. Matched by exact string, so a value that is not configured for the project is ignored silently. Accepts {{variables}}.',
    }),
  }),
})
