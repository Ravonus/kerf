import { channel, mutation, query, sharedState, stream } from '@kerf-js/start'
import { z } from 'zod'

export const probeQuery = query({ run: () => 'Server query' })
export const probeMutation = mutation({ run: () => 'Server mutation' })
export const probeChannel = channel({ authorize: () => true })
export const probeShared = sharedState('critic', {
  key: z.string(),
  value: z.string(),
  initial: 'Release shared value',
  authorize: { read: () => true, write: () => true },
})
export const probeStream = stream({
  async *run() {
    yield 'Server stream'
  },
})
