import { NextApiRequest, NextApiResponse } from 'next'
import {
  initGraceful,
  triggerDrain,
  isDraining,
  healthSnapshot,
} from '@typebot.io/lib'

// Initialize once per process; component name aids log filtering.
initGraceful({ component: 'builder' })

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Prevent any intermediary caching; health must reflect real-time state.
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'POST' && req.query.action === 'drain') {
    triggerDrain()
    return res.status(202).json({ status: 'draining' })
  }

  if (isDraining()) {
    const snap = healthSnapshot()
    return res.status(503).json(snap)
  }
  const snap = healthSnapshot()
  return res.status(200).json(snap)
}
