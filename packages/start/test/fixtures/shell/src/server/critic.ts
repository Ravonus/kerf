import { channel, mutation, query, sharedState, stream, StartError } from '@kerf-js/start'
import { z } from 'zod'

const message = z.strictObject({ text: z.string().max(40) })
let version = 0

export const probeQuery = query({
  output: message,
  tags: ['critic'],
  run: () => ({ text: `Server query ${version}` }),
})
export const probeChannel = channel({
  authorize: () => true,
  client: { request: z.null() },
  server: { notice: message },
  on: { request: ({ room }) => room.publish('notice', { text: 'Server channel' }) },
})
export const probeMutation = mutation({
  output: message,
  invalidates: ['critic'],
  optimistic: (_args, cache) => {
    cache.update(probeQuery, undefined, () => ({ text: 'Release prediction' }))
  },
  run: () => ({ text: `Server mutation ${++version}` }),
})
export const refuseMutation = mutation({
  output: message,
  run(): { text: string } {
    throw new StartError('Q010', 'PEER_PRIVATE_ERROR', undefined, { status: 403 })
  },
})
export const probeShared = sharedState('critic', {
  key: z.string(),
  value: z.string().max(40),
  initial: 'Release shared value',
  authorize: { read: () => true, write: () => true },
})
export const probeStream = stream({
  message,
  async *run() {
    yield { text: 'Server stream' }
  },
})
