// The change feed on Postgres: triggers NOTIFY, one dedicated connection LISTENs. The probe tries the real thing before it
// claims anything, because a pooler in transaction mode accepts LISTEN and then delivers nothing.

import postgres from 'postgres'
import { CHANNEL } from '../changes-sql.mjs'
import type { Probe, Sink } from '../changes'

type Sql = ReturnType<typeof postgres>

const SECRET = /\/\/[^@/]*@/
const opts = { onnotice: () => {}, connect_timeout: 5 }
const PROBE = 1500
const HEARTBEAT = 5_000
const MAX_BARRIER = 7_800

interface Options {
  url: string
  listenUrl?: string
  client: Sql
  tables: string[]
  interval?: number
  heartbeat?: number
}

/** Sends a NOTIFY and waits to hear it on a listening connection: the only proof a pooler can't fake. */
async function hears(direct: string, client: Sql): Promise<boolean | string> {
  const sql = postgres(direct, { ...opts, max: 1 })
  const token = `?${crypto.randomUUID()}`
  let heard!: () => void
  const got = new Promise<void>((ok) => {
    heard = ok
  })
  try {
    await sql.listen(CHANNEL, (p) => {
      if (p === token) heard()
    })
    await client.notify(CHANNEL, token)
    return await Promise.race([
      got.then(() => true),
      new Promise<boolean>((ok) => {
        setTimeout(ok, PROBE, false)
      }),
    ])
  } catch (e) {
    return (e as Error | null)?.message ?? String(e)
  } finally {
    void sql.end({ timeout: 0 }).catch(() => {})
  }
}

async function triggers(client: Sql, tables: string[]): Promise<string[]> {
  const rows =
    await client`select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'kerf_changes_upd' and c.relname = any(${tables})`
  return rows.map((r) => r.relname as string)
}

/** Whether this role may add them, for the error's fix. */
async function mayCreate(client: Sql, table: string): Promise<boolean> {
  const [r] =
    await client`select has_table_privilege(current_user, ${table}, 'TRIGGER') as ok`.catch(() => [
      { ok: false },
    ])
  return !!r?.ok
}

async function stats(client: Sql): Promise<boolean> {
  const [r] = await client`select current_setting('track_counts') = 'on' as ok`.catch(() => [
    { ok: false },
  ])
  return !!r?.ok
}

const poll = async (client: Sql, interval: number, why: string, fix: string): Promise<Probe> =>
  (await stats(client))
    ? {
        mode: 'poll',
        via: 'postgres-stats',
        why: `${why}. Reading table counters every ${interval / 1000} s: writes show up late, and by table only`,
        fix,
      }
    : {
        mode: 'off',
        via: 'none',
        why: `${why}, and \`track_counts\` is off, so there is nothing to poll`,
        fix,
      }

async function probe(
  direct: string,
  client: Sql,
  tables: string[],
  interval: number,
): Promise<Probe> {
  let have: string[]
  try {
    have = await triggers(client, tables)
  } catch (e) {
    return {
      mode: 'off',
      via: 'none',
      why: `the database didn't answer: ${((e as Error | null)?.message ?? String(e)).replace(SECRET, '//…@')}`,
      fix: 'check `DATABASE_URL`',
    }
  }
  const missing = tables.filter((t) => !have.includes(t))
  if (missing.length) {
    const allowed = await mayCreate(client, missing[0]!)
    return poll(
      client,
      interval,
      `no trigger on ${missing.map((t) => `\`${t}\``).join(', ')}`,
      allowed
        ? 'run `kerf db live`, then apply the migration'
        : `run \`kerf db live\`, and apply the migration as a role that may create triggers: this one has no TRIGGER on \`${missing[0]}\``,
    )
  }
  const ok = await hears(direct, client)
  if (ok === true) return { mode: 'feed', via: 'postgres-notify' }
  const pooler = /:6432\b|-pooler\.|pooler\./.test(direct)
  const why =
    typeof ok === 'string'
      ? `LISTEN failed: ${ok.replace(SECRET, '//…@')}`
      : `a NOTIFY never reached a LISTEN on this connection${pooler ? ', which looks like a pooler' : ''}: a pooler in transaction mode does that`
  return poll(client, interval, why, 'give `dbChanges` a direct connection: `{ listenUrl }`')
}

/** A self-addressed NOTIFY proves the listener is alive: a half-open TCP connection looks fine until then. */
async function listen(sink: Sink, direct: string, client: Sql, heartbeat: number, late: number) {
  let sql: Sql | undefined,
    started = false,
    stopped = false,
    seen = Date.now(),
    timer: ReturnType<typeof setTimeout> | undefined
  const token = `?${crypto.randomUUID()}`
  const heard = (payload: string) => {
    seen = Date.now()
    if (payload[0] === '?') return
    const m = JSON.parse(payload)
    if (m.b) return sink.settled(m.b)
    sink.changes(m.i ? m.i.map((id: string) => ({ table: m.t, id })) : [{ table: m.t }])
  }
  const connect = async () => {
    const mine = (sql = postgres(direct, { ...opts, max: 1, idle_timeout: 0 }))
    await mine.listen(CHANNEL, heard, () => {
      seen = Date.now()
      if (started) sink.lost() // what committed while it was gone is unknown
      started = true
      sink.up()
    })
  }
  const check = async () => {
    if (stopped) return
    if (Date.now() - seen > late) {
      sink.down('the database listener is not receiving')
      const old = sql
      sql = undefined
      void old?.end({ timeout: 0 }).catch(() => {})
      await connect().catch(() => {}) // the next check tries again
    }
    await client.notify(CHANNEL, token).catch(() => sink.down('the database is not answering'))
    if (stopped) return
    timer = setTimeout(() => void check(), heartbeat)
    ;(timer as { unref?(): void }).unref?.()
  }
  await connect().catch((e) =>
    sink.down(
      `the database listener can't connect: ${String(e?.message ?? e).replace(SECRET, '//…@')}`,
    ),
  )
  timer = setTimeout(() => void check(), heartbeat)
  ;(timer as { unref?(): void }).unref?.()
  return async () => {
    stopped = true
    clearTimeout(timer)
    await sql?.end({ timeout: 0 }).catch(() => {})
  }
}

/** `postgres-stats`: counters that only ever grow, per table, by the second. Nothing to install. */
function counters(sink: Sink, client: Sql, tables: string[], interval: number) {
  const seen = new Map<string, string>()
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined
  const look = async () => {
    if (stopped) return
    try {
      const rows =
        await client`select relname, n_tup_ins + n_tup_upd + n_tup_del + n_mod_since_analyze as n from pg_stat_user_tables where relname = any(${tables})`
      sink.up()
      const changed = rows.filter((r) => {
        const was = seen.get(r.relname)
        seen.set(r.relname, String(r.n))
        return was !== undefined && was !== String(r.n)
      })
      if (changed.length) sink.changes(changed.map((r) => ({ table: r.relname as string })))
    } catch {
      sink.down('the database is not answering')
    }
    timer = setTimeout(() => void look(), interval)
    ;(timer as { unref?(): void }).unref?.()
  }
  return look().then(() => () => {
    stopped = true
    clearTimeout(timer)
  })
}

export function postgresChanges({
  url,
  listenUrl,
  client,
  tables,
  interval = 2000,
  heartbeat = HEARTBEAT,
}: Options) {
  const direct = listenUrl ?? url
  const late = heartbeat * 2

  return {
    probe: () => probe(direct, client, tables, interval),
    start: (sink: Sink, how: Probe) =>
      how.via === 'postgres-notify'
        ? listen(sink, direct, client, heartbeat, late)
        : how.mode === 'poll'
          ? counters(sink, client, tables, interval)
          : Promise.resolve(() => {}),
    /** After the mutation committed, so it arrives after that commit's changes, and before the poke it stands for. */
    async settle(tags: string[]) {
      const text = JSON.stringify({ b: tags })
      await client.notify(
        CHANNEL,
        text.length < MAX_BARRIER
          ? text
          : JSON.stringify({ b: [...new Set(tags.map((t) => t.split(':')[0]))] }),
      )
    },
  }
}
