import { router } from '@/helpers/server/trpc'
import { createCredentials } from './createCredentials'
import { updateCredentials } from './updateCredentials'
import { deleteCredentials } from './deleteCredentials'
import { listCredentials } from './listCredentials'
import { getRestApiCredential } from './getRestApiCredential'
import { getCredentialsUsages } from './getCredentialsUsages'

export const credentialsRouter = router({
  createCredentials,
  updateCredentials,
  listCredentials,
  deleteCredentials,
  getRestApiCredential,
  getCredentialsUsages,
})
