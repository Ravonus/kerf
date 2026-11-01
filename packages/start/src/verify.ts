// `live: { required: true, verify: … }`: a real round trip against a target that isn't production, as part of `weft
// check` and `weft build`. A marked row goes in through a connection of its own, as any outside app's would; each link
// from there to a refetch is timed, and the row comes out again.
//
//   trigger → write → notify → app → poke → refetch → denied → cleanup
//
// A database target tests the first half and a URL target the app's half; with both, the whole chain. Whatever wasn't
// tested is reported, by name. `live-target.mjs` decides whether a target may be touched at all.

import postgres from 'postgres'
import { CHANNEL } from './changes-sql.mjs'
import type { Fn } from './data'
import type { Source } from './changes'

export interface VerifyOptions {
  /** `true` or a target's name, as `verify: true` and `verify: 'staging'` mean, for when the rest of this is needed too. */
  target?: true | string
  /** A running staging app. Fine in code. */
  url?: string
  /** A database, from the environment: `process.env.STAGING_DATABASE_URL`. */
  db?: string
  /** The query's input. */
  input?: unknown
  /** Columns of the test row: whose it is, so the signed-in test user can see it. The rest are made up. */
  row?: Record<string, unknown>
  /** Name of the env var with a cookie for a user who can see the row. Default `WEFT_STAGING_COOKIE`. */
  cookie?: string
  /** Name of the env var with a cookie for a user who can't. Default `WEFT_STAGING_OTHER_COOKIE`; without it, a signed-out client. */
  otherCookie?: string
  /** Ms each link may take. Default 5000. */
  timeout?: number
}

export const LINKS = ['trigger', 'write', 'notify', 'app', 'poke', 'refetch', 'denied', 'cleanup'] as const
export type Link = (typeof LINKS)[number]

export interface VerifyResult {
  ok: boolean
  /** The link that broke, and what it said. */
  broke?: { link: Link; why: string }
  ms: Partial<Record<Link, number>>
  untested: { link: Link; why: string }[]
}

class Broke extends Error {
  constructor(public link: Link, why: string) { super(why) }
}

const clean = (s: unknown) => String((s as any)?.message ?? s).replace(/\/\/[^@/\s]*@/g, '//…@')

/** A value for a required column nobody named. Foreign keys can't be guessed: `row` is for those. */
function made(type: string, marker: string): unknown {
  if (/uuid/.test(type)) return crypto.randomUUID()
  if (/int|serial/.test(type)) return Math.floor(Math.random() * 2_000_000_000)
  if (/numeric|double|real|money/.test(type)) return 0
  if (/bool/.test(type)) return false
  if (/timestamp|date/.test(type)) return new Date().toISOString()
  if (/time/.test(type)) return '00:00:00'
  if (/json/.test(type)) return JSON.stringify({ marker })
  return marker
}

async function insert(sql: postgres.Sql, table: string, marker: string, row: Record<string, unknown>, pk: string[]) {
  const cols = await sql`select column_name, data_type, is_nullable, column_default, is_identity, is_generated from information_schema.columns where table_schema = current_schema() and table_name = ${table} order by ordinal_position`
  if (!cols.length) throw new Broke('write', `no table \`${table}\` in this database`)
  const values: Record<string, unknown> = { ...row }
  let marked = false
  for (const c of cols) {
    const name = c.column_name as string
    if (name in values) continue
    if (/char|text/.test(c.data_type) && !marked) {
      values[name] = marker
      marked = true
    } else if (c.is_nullable === 'NO' && c.column_default === null && c.is_identity === 'NO' && c.is_generated === 'NEVER') values[name] = made(c.data_type, marker)
  }
  if (!marked) throw new Broke('write', `\`${table}\` has no free text column to mark a row with: name one less in \`row\``)
  const names = Object.keys(values)
  const quoted = (n: string) => `"${n.replaceAll('"', '""')}"`
  const key = pk.length ? pk : names.slice(0, 1)
  const [got] = await sql.unsafe(`insert into ${quoted(table)} (${names.map(quoted).join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning ${key.map(quoted).join(', ')}`, names.map(n => values[n]) as any[])
  const where = key.map((k, i) => `${quoted(k)} = $${i + 1}`).join(' and ')
  return { id: key.map(k => String(got[k])).join(':'), remove: () => sql.unsafe(`delete from ${quoted(table)} where ${where}`, key.map(k => got[k])) }
}

async function primaryKey(sql: postgres.Sql, table: string): Promise<string[]> {
  const rows = await sql`select a.attname from pg_index i join pg_class c on c.oid = i.indrelid join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey) where c.relname = ${table} and i.indisprimary`
  return rows.map(r => r.attname as string)
}

/** One SSE connection to the app, by the protocol a browser's tab speaks. */
async function subscribe(url: string, id: string, input: unknown, cookie: string | undefined, signal: AbortSignal) {
  const res = await fetch(`${url}/_weft/rt`, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-weft': '1', accept: 'text/event-stream', origin: url, ...(cookie && { cookie }) }, body: JSON.stringify({ s: [[1, 'q', id, input]] }) })
  if (!res.ok) throw new Error(`\`/_weft/rt\` answered ${res.status}`)
  const frames: [string, any][] = []
  const waiting = new Set<() => void>()
  void (async () => {
    const dec = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true })
        for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
          if (buf[0] === ':') continue
          const line = buf.indexOf('\n')
          frames.push([buf.slice(7, line), JSON.parse(buf.slice(line + 7, i))])
          for (const w of waiting) w()
        }
      }
    } catch {}
  })()
  const until = async (test: (f: [string, any]) => boolean, ms: number) => {
    const end = Date.now() + ms
    for (;;) {
      const hit = frames.find(test)
      if (hit) return hit
      const left = end - Date.now()
      if (left <= 0) return undefined
      await new Promise<void>(ok => {
        const t = setTimeout(ok, left)
        waiting.add(() => { clearTimeout(t); ok() })
      })
      waiting.clear()
    }
  }
  return { frames, until }
}

const read = (url: string, id: string, input: unknown, cookie?: string) =>
  fetch(`${url}/_weft/fn/${id}${input == null ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`, { headers: { accept: 'application/json', ...(cookie && { cookie }) } })

export interface RoundTrip {
  fn: Fn
  source?: Source
  url?: string
  db?: string
  options: VerifyOptions
  env: Record<string, string | undefined>
}

/** The query's table: the first of its tags `changes` reports. */
function tableOf(fn: Fn, source: Source | undefined, input: unknown): string | undefined {
  const any = new Proxy({}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '*' : '*') })
  let tags: readonly string[] = []
  try { tags = typeof fn.def.tags === 'function' ? fn.def.tags(input ?? any, any) : fn.def.tags ?? [] } catch {}
  const names = tags.map(t => t.split(':')[0])
  return names.find(t => source?.tables.includes(t)) ?? names[0]
}

export async function roundTrip({ fn, source, url, db, options, env }: RoundTrip): Promise<VerifyResult> {
  const timeout = options.timeout ?? 5000
  const marker = `weft-verify-${crypto.randomUUID()}` // concurrent builds never touch each other's row
  const ms: VerifyResult['ms'] = {}
  const untested: VerifyResult['untested'] = []
  const input = options.input
  const cookie = env[options.cookie ?? 'WEFT_STAGING_COOKIE']
  const other = env[options.otherCookie ?? 'WEFT_STAGING_OTHER_COOKIE']
  const timed = async <T,>(link: Link, run: () => Promise<T>): Promise<T> => {
    const t = performance.now()
    try {
      return await run()
    } catch (e) {
      throw e instanceof Broke ? e : new Broke(link, clean(e))
    } finally {
      ms[link] = Math.round(performance.now() - t)
    }
  }
  const skip = (links: Link[], why: string) => { for (const link of links) untested.push({ link, why }) }
  const sql = db ? postgres(db, { max: 3, idle_timeout: 2, connect_timeout: 5, onnotice: () => {} }) : undefined
  const listener = db ? postgres(db, { max: 1, idle_timeout: 2, connect_timeout: 5, onnotice: () => {} }) : undefined
  const ac = new AbortController()
  let row: Awaited<ReturnType<typeof insert>> | undefined
  let cleaning: unknown
  try {
    const table = tableOf(fn, source, input)
    if (!table) throw new Broke('trigger', `\`${fn.$id}\` has no tag naming a table`)
    const heard: string[] = []
    let hearing: (() => void) | undefined
    if (sql) {
      await timed('trigger', async () => {
        const [t] = await sql`select t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'weft_changes_ins' and c.relname = ${table}`
        if (!t) throw new Broke('trigger', `\`${table}\` has no change trigger: run \`weft db live\`, and apply the migration there`)
        if (t.tgenabled === 'D') throw new Broke('trigger', `the change trigger on \`${table}\` is disabled`)
      })
      await listener!.listen(CHANNEL, p => { heard.push(p); hearing?.() })
    } else skip(['trigger', 'write', 'notify', 'poke', 'refetch', 'denied', 'cleanup'], 'no database target: nothing wrote a row, so only the app and its feed were checked. Set `STAGING_DATABASE_URL` or `verify.db`')

    const live = url ? await timed('app', async () => {
      const a = await subscribe(url, fn.$id, input, cookie, ac.signal)
      const hi = await a.until(f => f[0] === 'h', timeout)
      if (!hi) throw new Broke('app', 'the app accepted the connection and said nothing')
      if (hi[1].l?.m !== 'feed' && hi[1].l?.m !== 'external') throw new Broke('app', `the app's live mode is \`${hi[1].l?.m ?? 'app'}\`, not a feed: its log says why`)
      if (hi[1].l?.d) throw new Broke('app', 'the app\'s change feed is down')
      const ack = await a.until(f => (f[0] === 'a' || f[0] === 'e') && f[1][0] === 1, timeout)
      if (!ack) throw new Broke('app', 'no answer to the subscription')
      if (ack[0] === 'e') throw new Broke('app', ack[1][1].code === 'Q009' ? `the app doesn't know \`${fn.$id}\`: it runs another build` : ack[1][1].code === 'A002' ? `\`${fn.$id}\` needs a signed-in user: set \`WEFT_STAGING_COOKIE\`` : `the subscription failed: ${ack[1][1].message}`)
      return { ...a, tags: ack[1][1] as string[] }
    }) : undefined
    if (!url) skip(sql ? ['app', 'poke', 'refetch', 'denied'] : ['app'], 'no URL target: the database half was tested, not the running app. Set `WEFT_STAGING_URL` or `verify.url`')

    if (!sql) {
      if (live) ac.abort()
      return { ok: true, ms, untested }
    }
    const denied = url && !(cookie && !other && !fn.def.auth) ? await subscribe(url, fn.$id, input, other, ac.signal).catch(() => undefined) : undefined

    const pk = await primaryKey(sql, table)
    row = await timed('write', () => insert(sql, table, marker, options.row ?? {}, pk))
    await timed('notify', async () => {
      const seen = () => heard.some(h => { try { const m = JSON.parse(h); return m.t === table && (!m.i || m.i.includes(row!.id)) } catch { return false } })
      if (!seen()) await new Promise<void>(ok => {
        const t = setTimeout(ok, timeout)
        hearing = () => { if (seen()) { clearTimeout(t); ok() } }
      })
      if (!seen()) throw new Broke('notify', `the trigger on \`${table}\` sent nothing on \`${CHANNEL}\` within ${timeout} ms`)
    })
    if (live) {
      await timed('poke', async () => {
        const p = await live.until(f => f[0] === 'p' && f[1].t.some((t: string) => live.tags.includes(t)), timeout)
        if (!p) throw new Broke('poke', `the database notified, and the app never poked this subscription within ${timeout} ms: its listener, or a tag the query doesn't declare`)
      })
      await timed('refetch', async () => {
        const end = Date.now() + timeout
        for (;;) {
          const res = await read(url!, fn.$id, input, cookie)
          if (res.ok && (await res.text()).includes(marker)) return
          if (Date.now() > end) throw new Broke('refetch', `poked, and the query didn't return the row within ${timeout} ms${options.row ? '' : ': if it filters by user, say whose it is in `verify.row`'}`)
          await new Promise(ok => setTimeout(ok, 50))
        }
      })
      if (denied) await timed('denied', async () => {
        const res = await read(url!, fn.$id, input, other)
        const text = await res.text()
        if (text.includes(marker) || denied.frames.some(f => JSON.stringify(f[1]).includes(marker))) throw new Broke('denied', `${other ? 'the other user' : 'a signed-out client'} got the row`)
      })
      else skip(['denied'], 'a query with no `auth` and no other user to compare: set `WEFT_STAGING_OTHER_COOKIE`')
    }
    return { ok: true, ms, untested }
  } catch (e) {
    const b = e instanceof Broke ? e : new Broke('trigger', clean(e))
    return { ok: false, broke: { link: b.link, why: clean(b.message) }, ms, untested }
  } finally {
    ac.abort()
    if (row) {
      const t = performance.now()
      try {
        await row.remove()
        ms.cleanup = Math.round(performance.now() - t)
      } catch (e) {
        cleaning = e
      }
    }
    await Promise.all([sql?.end({ timeout: 1 }), listener?.end({ timeout: 1 })]).catch(() => {})
    if (cleaning) throw new Broke('cleanup', `row \`${marker}\` is still there: ${clean(cleaning)}`)
  }
}
