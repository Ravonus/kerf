import { channel } from '@weft-js/start'
import { z } from 'zod'

const replies = ['Got it.', 'Still here.', 'That was the last one.']

// Each visitor gets a room of their own, so nothing is shared and nothing is kept.
export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  authorize: () => true,
  client: { say: z.object({ text: z.string().min(1).max(200) }) },
  server: { said: z.object({ id: z.string(), who: z.string(), text: z.string() }) },
  on: {
    say: async ({ msg, params, room: here }) => {
      await here.publish('said', { id: crypto.randomUUID(), who: 'You', text: msg.text })
      replies.forEach((text, i) =>
        setTimeout(
          () => {
            void room.in(params).publish('said', { id: crypto.randomUUID(), who: 'Server', text })
          },
          (i + 1) * 2000,
        ),
      )
    },
  },
  limits: { perSecond: 5 },
})
