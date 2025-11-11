import { NextApiRequest, NextApiResponse } from 'next'
import {
  initGraceful,
  triggerDrain,
  isDraining,
  healthSnapshot,
} from '@typebot.io/lib'

initGraceful({ component: 'viewer' })

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'POST' && req.query.action === 'drain') {
    triggerDrain()
    return res.status(202).json({ status: 'draining' })
  }
  if (isDraining()) {
    return res.status(503).json(healthSnapshot())
  }
  return res.status(200).json(healthSnapshot())
}
