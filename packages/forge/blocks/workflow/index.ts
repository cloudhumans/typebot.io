import { createBlock } from '@typebot.io/forge'
import { WorkflowLogo } from './logo'
import { endWorkflow } from './actions/endWorkflow'

export const workflowBlock = createBlock({
  id: 'workflow',
  name: 'Workflow',
  tags: ['workflow', 'logic'],
  LightLogo: WorkflowLogo,
  actions: [endWorkflow],
})
