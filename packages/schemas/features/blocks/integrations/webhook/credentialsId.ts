// The credentials dropdown emits this sentinel to mean "no credentials", and
// stored block options may carry it too. Keep the value and its normalization in
// one place so the runtime, builder UI and APIs all agree on whether a block has
// a credential set — duplicating the `!== 'default'` check invites drift if the
// sentinel ever changes.
export const NO_CREDENTIALS_SENTINEL = 'default'

export const normalizeCredentialsId = (
  credentialsId: string | null | undefined
): string | undefined =>
  credentialsId && credentialsId !== NO_CREDENTIALS_SENTINEL
    ? credentialsId
    : undefined
