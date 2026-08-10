import { router } from '../trpc'
import { createTypebot } from '@/features/typebot/api/createTypebot'
import { updateTypebot } from '@/features/typebot/api/updateTypebot'
import { publishTypebot } from '@/features/typebot/api/publishTypebot'
import { getTypebot } from '@/features/typebot/api/getTypebot'
import { listTypebots } from '@/features/typebot/api/listTypebots'
import { listTypebotsClaudia } from '@/features/typebot/api/listTypebotsClaudia'
import { getTypebotHistory } from '@/features/typebot/api/getTypebotHistory'

// Curated subset exposed to the GAD via the typebot-admin MCP slug.
// Authoring only (create/update/publish/get/list/history). Excludes
// billing/credentials/custom-domains/whatsApp/folders and DELETE.
// Each procedure keeps its own openapi.path meta, so the generated doc
// contains exactly these /v1/typebots paths.
export const claudiaAdminRouter = router({
  createTypebot,
  updateTypebot,
  publishTypebot,
  getTypebot,
  listTypebots,
  listTypebotsClaudia,
  getTypebotHistory,
})

export type ClaudiaAdminRouter = typeof claudiaAdminRouter
