// The server's half of `interaction({ share })` (research 45 §6, §7). One join per socket, `$share`, and every key goes
// through `realtime({ share })`: no such option, no join (R011), and a key it refuses gets nothing and can say nothing.
//
//   rooms     64 hub channels, by a hash of the key, so bus subscriptions stay bounded. One listener per instance: an
//             event costs the keys it names and who holds them, not every socket. A client still receives only its keys.
//   batching  one `u` frame adds and drops many keys and one `set` frame carries many bits; each comes back as one frame.
//   snapshot  each instance answers for its own sockets, from what those sockets last said, so a joiner costs its
//             holders nothing on the wire. What's held lives and dies with the connection: nothing outlives a socket.
//   rule      per key, or `{ keys }` for a whole frame in one call, so a join of up to 400 keys is one database read.
//   leaving   `left` says zero for what the socket held. Every event is volatile: no ring, no replay.
//   identity  the sender's connection id is stamped here. Bits and an opaque id, nothing else exists to see.

import type { Context, Fn, StandardSchemaV1 } from './data'
import { StartError } from './data'
import type { Ev, Hub } from './hub'

export const SHARE = '$share'
export const MAX_KEY = 128
/** Entries one frame may carry. The client chunks to this. */
export const MAX_BATCH = 400
const SHARDS = 64

/** One key at a time, or `{ keys }` to answer a whole join at once: a rule that reads a database runs once for it. */
export type ShareRule =
  | ((args: { ctx: Context; key: string }) => boolean | Promise<boolean>)
  | { keys: (args: { ctx: Context; keys: string[] }) => Iterable<string> | Promise<Iterable<string>> }

type Issue = { issues: { message: string }[] }
type Sent = { add?: unknown; drop?: unknown; e?: unknown } | null | undefined
const isIssue = (r: unknown): r is Issue => !!(r as Partial<Issue> | null | undefined)?.issues
const schema = <T,>(validate: (v: Sent) => T | Issue): StandardSchemaV1<T, T> => ({ '~standard': { version: 1, vendor: 'weft', validate: (v: unknown) => { const r = validate(v as Sent); return isIssue(r) ? r : { value: r } } } })

/** What a handler of the share channel is given. */
interface Said<M = unknown> { msg: M; id: string; ctx: Context; reply: Client['reply'] }
const no = (message: string): Issue => ({ issues: [{ message }] })
const isKey = (k: unknown): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY
const isBits = (b: unknown) => Number.isInteger(b) && (b as number) >= 0 && (b as number) <= 7
const anything = schema(v => v)

/** Who has `k` in `s`: `[id, key, bits]`. */
type Triple = [id: string, key: string, bits: number]
interface Client { id: string; keys: Map<string, number>; reply(name: string, msg: unknown): void }
interface Shard { name: string; refs: number; ch: ReturnType<Hub['channel']>; on: (ev: Ev | null) => void }
interface Sharing { clients: Map<string, Client>; holders: Map<string, Set<Client>>; shards: Map<number, Shard> }

const states = new WeakMap<Hub, Sharing>()
const stateOf = (h: Hub) => {
  let s = states.get(h)
  if (!s) states.set(h, (s = { clients: new Map(), holders: new Map(), shards: new Map() }))
  return s
}

/** FNV-1a. It only has to spread keys, and to agree across instances. */
function shardOf(key: string) {
  let x = 2166136261
  for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 16777619)
  return (x >>> 0) % SHARDS
}

const byShard = <T,>(items: T[], key: (item: T) => string) => {
  const out = new Map<number, T[]>()
  for (const item of items) {
    const s = shardOf(key(item))
    const list = out.get(s)
    if (list) list.push(item)
    else out.set(s, [item])
  }
  return out
}

const publish = (h: Hub, shard: number, body: object) => h.bus.publish(`weft:s:${shard}`, `{"v":1,${JSON.stringify(body).slice(1)}`)

function heard(h: Hub, st: Sharing, shard: number, ev: Ev | null) {
  if (!ev) return // the bus lost something: bits are re-said on a beat, and peers age out
  const m = (ev.p ??= JSON.parse(ev.raw)) as { f?: string; e?: [string, number][]; a?: string; k?: string[]; t?: string; s?: Triple[] }
  if (m.t) return  (m.s && st.clients.get(m.t)?.reply('b', { s: m.s }))
  if (m.a) {
    const s: Triple[] = []
    for (const key of m.k ?? []) for (const c of st.holders.get(key) ?? []) {
      const bits = c.keys.get(key)
      if (bits && c.id !== m.a) s.push([c.id, key, bits])
    }
    if (s.length) void publish(h, shard, { t: m.a, s })
    return
  }
  // One frame per client per event, whatever it names.
  const each = new Map<Client, Triple[]>()
  for (const [key, bits] of m.e ?? []) for (const c of st.holders.get(key) ?? []) {
    if (c.id === m.f) continue
    const list = each.get(c)
    if (list) list.push([m.f!, key, bits])
    else each.set(c, [[m.f!, key, bits]])
  }
  for (const [c, s] of each) c.reply('b', { s })
}

function hold(h: Hub, st: Sharing, c: Client, key: string) {
  if (c.keys.has(key)) return false
  c.keys.set(key, 0)
  let set = st.holders.get(key)
  if (!set) st.holders.set(key, (set = new Set()))
  set.add(c)
  const n = shardOf(key)
  let shard = st.shards.get(n)
  if (!shard) {
    const name = `weft:s:${n}`, ch = h.channel(name), on = (ev: Ev | null) => heard(h, st, n, ev)
    ch.listeners.add(on)
    st.shards.set(n, (shard = { name, refs: 0, ch, on }))
  }
  shard.refs++
  return true
}

function unhold(h: Hub, st: Sharing, c: Client, key: string) {
  if (!c.keys.delete(key)) return
  const set = st.holders.get(key)!
  set.delete(c)
  if (!set.size) st.holders.delete(key)
  const n = shardOf(key), shard = st.shards.get(n)!
  if (--shard.refs) return
  st.shards.delete(n)
  h.unlisten(shard.ch, shard.on)
}

/** Say zero for what these keys held, then let go of them. */
function release(h: Hub, st: Sharing, c: Client, keys: string[]) {
  const held = keys.filter(k => c.keys.get(k))
  for (const k of keys) unhold(h, st, c, k)
  return Promise.all([...byShard(held, k => k)].map(([n, list]) => publish(h, n, { f: c.id, e: list.map(k => [k, 0]) })))
}

async function allowedKeys(rule: ShareRule, ctx: Context, keys: string[]) {
  if (!keys.length) return keys
  if (typeof rule !== 'function') {
    const yes = await Promise.resolve().then(() => rule.keys({ ctx, keys })).catch(() => [])
    const passed = new Set(yes)
    return keys.filter(k => passed.has(k))
  }
  const answers = await Promise.all(keys.map(key => Promise.resolve().then(() => rule({ ctx, key })).catch(() => false)))
  return keys.filter((_, i) => answers[i])
}

/** The `channel` behind `share`, made per hub. socket.ts takes it for `$share`, so every limit a channel has applies. */
export function shareChannel(h: Hub): Fn {
  const rule = h.share
  const st = stateOf(h)
  const client = (id: string, reply: Client['reply']) => {
    let c = st.clients.get(id)
    if (!c) st.clients.set(id, (c = { id, keys: new Map(), reply }))
    return c
  }
  return {
    kind: 'channel', $id: SHARE,
    def: {
      authorize() {
        if (rule) return true
        throw new StartError('R011', '`interaction({ share })` crossed to the socket, and nothing allows it', 'add `share: ({ ctx, key }) => …` to `realtime()`; `() => true` must be written out')
      },
      client: {
        u: schema<{ add: string[]; drop: string[] }>(v => {
          const add = v?.add ?? [], drop = v?.drop ?? []
          return Array.isArray(add) && Array.isArray(drop) && add.length + drop.length <= MAX_BATCH && add.every(isKey) && drop.every(isKey) ? { add, drop } : no(`\`u\` takes up to ${MAX_BATCH} keys of 1 to ${MAX_KEY} characters`)
        }),
        set: schema<{ e: [string, number][] }>(v => (Array.isArray(v?.e) && v.e.length <= MAX_BATCH && v.e.every(x => Array.isArray(x) && isKey(x[0]) && isBits(x[1])) ? { e: v.e } : no('`set` takes `[key, bits]` pairs, bits 0 to 7'))),
      },
      server: { ok: anything, b: anything },
      on: {
        async u({ msg, id, ctx, reply }: Said<{ add: string[]; drop: string[] }>) {
          const c = client(id, reply)
          await release(h, st, c, msg.drop)
          const room = Math.max(0, h.limits.shareKeys - c.keys.size)
          const fresh = msg.add.filter(k => !c.keys.has(k))
          const asked = fresh.slice(0, room)
          const ok = await allowedKeys(rule!, ctx, asked)
          if (!st.clients.has(id)) return // it left while the rule ran
          const passed = new Set(ok)
          for (const k of ok) hold(h, st, c, k)
          await Promise.all(ok.length ? [...byShard<string>(ok, k => k)].map(([n, k]) => st.shards.get(n)!.ch.ready.then(() => publish(h, n, { a: id, k }))) : [])
          reply('ok', { id, no: fresh.filter(k => !passed.has(k)) })
        },
        set({ msg, id }: Said<{ e: [string, number][] }>) {
          const c = st.clients.get(id)
          if (!c) return
          const known = msg.e.filter(([k]) => c.keys.has(k))
          for (const [k, bits] of known) c.keys.set(k, bits)
          return Promise.all([...byShard(known, e => e[0])].map(([n, e]) => publish(h, n, { f: id, e })))
        },
      },
      left({ id }: Pick<Said, 'id'>) {
        const c = st.clients.get(id)
        if (!c) return
        st.clients.delete(id)
        return release(h, st, c, [...c.keys.keys()])
      },
      /** The session again: every key this socket holds goes back through the rule. */
      async recheck({ id, ctx, reply }: Said) {
        const c = st.clients.get(id)
        if (!c || !rule) return
        const keys = [...c.keys.keys()]
        const passed = new Set(await allowedKeys(rule, ctx, keys))
        const gone = keys.filter(k => !passed.has(k))
        if (!gone.length) return
        await release(h, st, c, gone)
        reply('ok', { id, no: gone })
      },
    },
  } as unknown as Fn
}
