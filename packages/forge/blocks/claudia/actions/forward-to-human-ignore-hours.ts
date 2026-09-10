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
        silent: options.silent,
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
        'Requires Cloud Humans to enable the tag feature for your project. Production reads only the last published version, so republish this flow and every linked sub-flow after editing a tag; until then the previously published tag, if any, stays live. No commas; max 128 characters; `NO_TAG` and `NO_TAG_*` are reserved. Whenever this tag does not apply, ClaudIA falls back to deriving the tag as usual.',
      moreInfoTooltip:
        'Pins the conversation tag instead of letting ClaudIA derive it. The first tag recorded for a conversation is final, and when a turn passes through more than one ClaudIA block only the tag from the last block is read. It reaches the helpdesk as-is on Zendesk and most channels, creating the tag; on HubSpot, Octadesk and legacy Intercom it is dropped unless registered there first, and on FrontApp tags are never written at all. Accepts {{variables}}, but an unset variable resolves to nothing — campanha_{{tipo}} becomes campanha_, which cannot be corrected afterwards for that conversation, so check the tag in the Claudia Response toast in preview. Preview reads drafts, so what it shows only reaches production after you republish.',
    }),
    silent: option.boolean.layout({
      label: 'Silent (no message sent)',
      accordion: 'Advanced settings',
      moreInfoTooltip:
        'Ends the turn without sending anything to the customer. The ticket is still closed (or handed over to N2), and the internal note is still written — only the customer-facing message is skipped. Use it when the flow must stop a ticket silently, such as a spam branch. With this on, the flow does not need a text bubble before this block; without it, a turn with no bubble is treated as a flow error.',
    }),
  }),
})
