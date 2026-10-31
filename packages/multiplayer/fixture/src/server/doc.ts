// A shared document: presence, cursors, a relay, one shared value, and the room's own message beside them.
import { channel, sharedState, type StandardSchemaV1 } from '@weft/start'
import { multiplayer } from '@weft/multiplayer/server'
import { socketioTicket } from '@weft/realtime-socketio/relay'
import { livekitTicket } from '@weft/realtime-livekit/server'

const object = <T,>(check: (v: any) => boolean): StandardSchemaV1<T, T> => ({ '~standard': { version: 1, vendor: 'fixture', validate: v => (check(v) ? { value: v as T } : { issues: [{ message: 'bad' }] }) } }) as any
const Params = object<{ id: string }>(v => typeof v?.id === 'string' && v.id.length <= 64)
const Note = object<{ text: string }>(v => typeof v?.text === 'string' && v.text.length <= 500)
const Ping = object<{ at: string }>(v => typeof v?.at === 'string' && v.at.length <= 64)

const { WEFT_E2E_SOCKETIO_SECRET: secret, LIVEKIT_API_KEY: livekit } = process.env
const ticket = secret ? socketioTicket({ secret }) : livekit ? livekitTicket() : undefined

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => ({ id: ctx.who, name: ctx.who }),
  relay: { ping: Ping },
  ticket,
})

export const doc = channel({
  params: Params,
  authorize: ({ params }) => params.id !== 'forbidden',
  client: { ...mp.client, note: Note },
  server: { ...mp.server, noted: Note },
  on: { ...mp.on, note: ({ msg, room }) => room.publish('noted', msg) },
  left: mp.left,
})

export const title = sharedState('title', {
  key: Params,
  value: object<string>(v => typeof v === 'string' && v.length <= 200),
  initial: '',
  authorize: { read: () => true, write: () => true },
})
