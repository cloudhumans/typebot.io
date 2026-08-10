import { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Prevent any intermediary caching; probes must reflect real-time state.
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ status: 'ok' })
}
