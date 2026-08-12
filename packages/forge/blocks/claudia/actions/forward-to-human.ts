import { createAction, option } from '@typebot.io/forge'
import { createClaudiaResponseLog } from '../helpers/createClaudiaResponseLog'

export const forwardToHuman = createAction({
  name: 'Forward to Human [N2]',
  run: {
    server: ({ logs, options }) => {
      const log = createClaudiaResponseLog({
        action: 'FORWARD_TO_HUMAN',
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
      helperText:
        'Requires Cloud Humans to enable the tag feature for your project, and requires republishing this flow and every linked sub-flow that sets a tag — with either one missing, no tag is recorded at all. No commas; `NO_TAG` and `NO_TAG_*` are reserved.',
      moreInfoTooltip:
        'Pins the conversation tag instead of letting ClaudIA derive it. The first tag recorded for a conversation is final, and when a turn passes through more than one ClaudIA block only the tag from the last block is read. It reaches the helpdesk as-is on Zendesk and most channels, creating the tag; on HubSpot, Octadesk and legacy Intercom it is dropped unless registered there first, and on FrontApp tags are never written at all. Accepts {{variables}}, but an unset variable resolves to nothing — campanha_{{tipo}} becomes campanha_, which cannot be corrected afterwards, so run the flow in preview and check the tag in the Claudia Response toast.',
    }),
  }),
})
