import { NextApiRequest, NextApiResponse } from 'next'
import {
  initGraceful,
  isDraining,
  healthSnapshot,
  beginRequest,
} from '@typebot.io/lib'

initGraceful({ component: 'viewer' })

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const end = beginRequest()
  res.setHeader('Cache-Control', 'no-store')
  if (isDraining()) {
    const snap = healthSnapshot()
    end()
    return res.status(503).json(snap)
  }
  const snap = healthSnapshot()
  end()
  return res.status(200).json(snap)
}
