import { runtimes } from '../data'
import { ApiPreviewInstructions } from './ApiPreviewInstructions'
import { DebugVariable } from './DebugVariablesPanel'
import { WebPreview } from './WebPreview'
import { WhatsAppPreviewInstructions } from './WhatsAppPreviewInstructions'

type Props = {
  runtime: (typeof runtimes)[number]['name']
  onNewVariables?: (variables: DebugVariable[]) => void
}

export const PreviewDrawerBody = ({
  runtime,
  onNewVariables,
}: Props): JSX.Element => {
  switch (runtime) {
    case 'Web': {
      return <WebPreview onNewVariables={onNewVariables} />
    }
    case 'WhatsApp': {
      return <WhatsAppPreviewInstructions />
    }
    case 'API': {
      return <ApiPreviewInstructions pt="4" />
    }
  }
}
