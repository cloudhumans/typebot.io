import { router } from '@/helpers/server/trpc'
import { createCredentials } from './createCredentials'
import { deleteCredentials } from './deleteCredentials'
import { listCredentials } from './listCredentials'
import { getRestApiCredential } from './getRestApiCredential'

export const credentialsRouter = router({
  createCredentials,
  listCredentials,
  deleteCredentials,
  getRestApiCredential,
})
