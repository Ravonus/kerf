// Channels in the fixture (research 32): a room with `authorize`, a shared value, and a way to change who may join.
import { channel, mutation, sharedState } from '@kerf-js/start'
import { object } from '../schema'

let banned = new Set<string>()

export const room = channel({
  params: object({ roomId: 'string' }),
  authorize: ({ params }) => !banned.has(params.roomId),
  client: { say: object({ text: 'string' }) },
  server: { said: object({ text: 'string' }) },
  on: {
    say: async ({ msg, room }) => {
      await room.publish('said', { text: msg.text })
    },
  },
})

export const counter = sharedState('count', {
  key: object({ id: 'string' }),
  value: object({ n: 'number' }),
  initial: { n: 0 },
  authorize: { read: () => true, write: () => true },
})

export const postToRoom = mutation({
  input: object({ roomId: 'string', text: 'string' }),
  run: async ({ input }) => {
    await room.in({ roomId: input.roomId }).publish('said', { text: input.text })
  },
})

export const ban = mutation({
  input: object({ roomId: 'string' }),
  run: async ({ input }) => {
    banned.add(input.roomId)
  },
})
