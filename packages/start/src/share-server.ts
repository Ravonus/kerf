// PROTOTYPE (research 40): the server's half of `share`, as messages a `channel` spreads in, like `multiplayer()`. It
// stores nothing: a joiner asks and holders answer, `left` clears a client that went, and every message is volatile. The
// sender is stamped here, so a client can't speak for another. In the spec this is built in behind `realtime({ share })`.
import type { StandardSchemaV1 } from './data'

type Issue = { issues: { message: string }[] }
const schema = <T,>(validate: (v: any) => T | Issue): StandardSchemaV1<T, T> => ({ '~standard': { version: 1, vendor: 'weft', validate: (v: unknown) => { const r: any = validate(v); return r?.issues ? r : { value: r } } } }) as any
const no = (message: string): Issue => ({ issues: [{ message }] })
const bit = (b: unknown) => Number.isInteger(b) && (b as number) >= 0 && (b as number) <= 7
const anything = schema(v => v)

export const MAX_KEY = 128
const v = { volatile: true } as const
const others = { exceptSelf: true, volatile: true } as const

export const shareRoom = {
  params: schema<{ key: string }>(v => (typeof v?.key === 'string' && v.key.length > 0 && v.key.length <= MAX_KEY ? { key: v.key } : no(`a share key is 1 to ${MAX_KEY} characters`))),
  client: {
    set: schema<{ bits: number }>(v => (bit(v?.bits) ? { bits: v.bits } : no('`bits` is 0 to 7'))),
    ask: schema<Record<string, never>>(() => ({})),
    answer: schema<{ to: string; bits: number }>(v => (bit(v?.bits) && typeof v?.to === 'string' ? { to: v.to, bits: v.bits } : no('an answer names who asked'))),
  },
  server: { state: anything, ask: anything, gone: anything },
  on: {
    set: ({ msg, id, room }: any) => room.publish('state', { id, bits: msg.bits }, others),
    ask: ({ id, room }: any) => room.publish('ask', { id }, others),
    answer: ({ msg, id, room }: any) => room.publish('state', { id, bits: msg.bits }, { to: msg.to, ...v }),
  },
  left: ({ id, room }: any) => room.publish('gone', { id }, v),
}
