type TypebotSettingsLike = {
  settings?: {
    general?: { type?: 'default' | 'TOOL' | 'CONTEXT_ENRICHMENT' }
  } | null
}

type StartParamsLike =
  | { type: 'preview'; headless?: boolean }
  | { type: 'live' }

export const resolveIsToolWorkflow = (
  typebot: TypebotSettingsLike,
  startParams: StartParamsLike
): boolean => {
  const type = typebot.settings?.general?.type
  if (type !== 'TOOL' && type !== 'CONTEXT_ENRICHMENT') return false
  if (startParams.type !== 'preview') return true
  return startParams.headless === true
}
