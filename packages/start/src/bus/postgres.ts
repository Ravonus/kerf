// LISTEN/NOTIFY (research 30 §3): one dedicated connection and one Postgres channel, with the logical channel in the
// payload, because Postgres identifiers stop at 63 bytes and tags don't. NOTIFY stops at 8,000 bytes, so a longer
// message goes base64 in numbered chunks inside one transaction, which Postgres delivers together and in order.

import postgres from 'postgres'
import type { Bus } from '../bus'
import { StartError } from '../data'

/** `postgresBus`: the database to send NOTIFY through. */
export interface PostgresBusOptions {
  /** `postgres://…`, direct: pgBouncer in transaction mode breaks LISTEN. */
  url: string
}

const CHANNEL = 'kerf_bus'
const WHOLE = 7_900
const CHUNK = 7_800

function delivery(listeners: Map<string, Set<(message: string) => void>>) {
  return (text: string) => {
    const at = text.indexOf('\n')
    const list = listeners.get(text.slice(0, at))
    if (list) for (const on of list) on(text.slice(at + 1))
  }
}

/** A bus on Postgres NOTIFY, for several instances with no broker beside the database. */
export function postgresBus({ url }: PostgresBusOptions): Bus {
  if (!url && process.env.KERF_BUILD) url = 'postgres://localhost/build' // a build loads this module and never connects
  if (!/^postgres(ql)?:\/\//.test(url ?? ''))
    throw new StartError(
      'Q013',
      `\`postgresBus\` needs a \`postgres://\` URL, not \`${(url ?? '').replace(/\/\/.*@/, '//…@')}\``,
      'set `DATABASE_URL`, or leave `bus` out for the memory bus on one instance',
    )
  let sql: ReturnType<typeof postgres> | undefined
  const client = () => (sql ??= postgres(url, { max: 2, idle_timeout: 20, onnotice: () => {} }))
  const listeners = new Map<string, Set<(message: string) => void>>()
  const gaps = new Set<() => void>()
  const parts = new Map<string, string[]>()
  let listening: Promise<unknown> | undefined
  let connected = false

  const deliver = delivery(listeners)
  const received = (payload: string) => {
    if (payload[0] === '=') return deliver(payload.slice(1))
    const [id, i, n, body] = payload.slice(1).split(':')
    if (id === undefined || i === undefined || n === undefined || body === undefined)
      return undefined
    const got = parts.get(id) ?? []
    got[+i] = body
    parts.set(id, got)
    if (Object.keys(got).length < +n) return undefined
    parts.delete(id)
    deliver(Buffer.from(got.join(''), 'base64').toString())
  }
  /** `onlisten` runs on every (re)connect: after the first, whatever was published meanwhile is gone. */
  const listen = () =>
    (listening ??= client()
      .listen(CHANNEL, received, () => {
        if (connected) {
          parts.clear()
          for (const gap of gaps) gap()
        }
        connected = true
      })
      .catch((e) => {
        listening = undefined // the next subscribe tries again
        throw e
      }))

  return {
    name: 'postgres',
    async publish(channel, message) {
      const text = `${channel}\n${message}`
      if (Buffer.byteLength(text) <= WHOLE) return void (await client().notify(CHANNEL, '=' + text))
      const b64 = Buffer.from(text).toString('base64')
      const id = crypto.randomUUID()
      const n = Math.ceil(b64.length / CHUNK)
      await client().begin(async (tx) => {
        for (let i = 0; i < n; i++)
          await tx`select pg_notify(${CHANNEL}, ${`+${id}:${i}:${n}:${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`})`
      })
    },
    async subscribe(channel, on, gap) {
      let list = listeners.get(channel)
      if (!list) listeners.set(channel, (list = new Set()))
      list.add(on)
      if (gap) gaps.add(gap)
      await listen()
      return () => {
        list.delete(on)
        if (!list.size) listeners.delete(channel)
        if (gap) gaps.delete(gap)
      }
    },
    async close() {
      await sql?.end({ timeout: 1 })
      sql = undefined
      listening = undefined
      connected = false
    },
  }
}
