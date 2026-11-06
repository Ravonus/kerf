import { channel } from '@weft-js/start'
import { multiplayer } from '@weft-js/multiplayer/server'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => (ctx.user ? { id: ctx.user.id, name: ctx.user.name } : { id: 'guest' }),
})
export const boardRoom = channel({
  params: z.object({ room: z.string().max(32) }),
  authorize: ({ ctx }) => ctx.user !== null,
  client: { ...mp.client },
  server: { ...mp.server },
  on: { ...mp.on },
  left: mp.left,
})
