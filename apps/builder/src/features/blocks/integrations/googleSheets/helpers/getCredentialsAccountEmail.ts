import type { OAuth2Client } from 'google-auth-library'

export const getCredentialsAccountEmail = async (
  client: OAuth2Client,
  fallback: string
): Promise<string> => {
  try {
    const { token } = await client.getAccessToken()
    if (!token) return fallback
    const { email } = await client.getTokenInfo(token)
    return email ?? fallback
  } catch {
    return fallback
  }
}
