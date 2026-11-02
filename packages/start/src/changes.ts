// Writes from outside the app reach `.live` queries. A database tells this module which table and ids changed; it turns
// those into tags and the hub pokes whoever subscribed to them. Clients refetch through their own `query`, so `auth`
// runs per user and no row travels with a poke: a user who can't see a row gets nothing new.
//
//   hold     A change waits `hold` ms. A mutation's poke covers what committed before it, so an app write needs no
//            second poke: before poking, the mutation sends a barrier down the same feed, which arrives after every
//            change committed earlier. Whatever a barrier's tags cover is dropped. No clock is involved, and a change
//            the barrier doesn't cover (cron, psql, a job with no `invalidates`) is delivered. Too slow a barrier costs
//            one extra refetch, never a missed one.
//   local    Every instance listens and pokes only its own connections: each client gets one poke with no leader to
//            elect. `listener: 'external'` is the other way round: one process listens, and publishes to the bus.
//   rate     After a flush the next waits `throttle` ms, so a writer in a loop can't drive refetches at its own pace.
//
// `q.live()` shows the mode (`liveMode`) and `degraded` or `reconnecting`, because a page that merely looks live is worse
// than one that says it isn't. Sources are in db/changes-*.ts; each probes what it can do before it says so.

import { StartError, type LiveMode } from './data'
import type { DbHandle } from './db/core'

export type { LiveMode } from './data'

/** What changed: never what it changed to. No `id`: the whole table. */
export interface Change { table: string; id?: string }

/** What a source learned about this database, by trying it. `feed` sees every change; `poll` only estimates. */
export interface Probe {
  mode: 'feed' | 'poll' | 'off'
  /** `postgres-notify`, `sqlite-data-version`, `mysql-log`, `mongo-change-stream`, `postgres-stats`… */
  via: string
  /** Why this and not something better. */
  why?: string
  fix?: string
}

export interface Sink {
  changes(list: Change[]): void
  /** A barrier arrived: what came before it and these tags cover is on its way as a poke. */
  settled(tags: string[]): void
  /** Changes may have gone unseen (a reconnect): every table is poked. */
  lost(): void
  down(why: string): void
  up(): void
}

export interface Source {
  readonly name: string
  readonly tables: string[]
  /** `listener: 'external'`: a separate process listens, and this app only reads the bus. */
  readonly external?: boolean
  /** Dev: the tags of one change. Default `[table, `${table}:${id}`]`. */
  readonly tagged?: (change: Change) => string[]
  /** Ms a change waits for its barrier, when a feed delivers in slower batches than the default 25. */
  readonly hold?: number
  /** The migration's input (`weft db live`). */
  defs?(): Promise<TableDef[]>
  readonly dialect?: string
  probe(): Promise<Probe>
  /** Starts from `probe`'s answer; resolves listening, with the way to stop. */
  start(sink: Sink, probe: Probe): Promise<() => unknown>
  /** Send a barrier through the feed. Omitted: only the hold window dedupes. */
  settle?(tags: string[]): Promise<void>
}

export interface TableDef { name: string; pk: string[] }

export interface ChangeOptions {
  /** Direct `postgres://…` for the listener, when the app's URL goes through a pooler. */
  listenUrl?: string
  /** `'external'`: a separately deployed listener publishes to the bus (`listen` from `@weft/start/listen`). */
  listener?: 'external'
  /** Map a change to tags your queries use. Default `[table, `${table}:${id}`]`. */
  tagged?: (change: Change) => string[]
  /** Ms between looks where the database can't push: SQLite's `data_version` (100), MySQL's log (500), Postgres's stats (2000). */
  interval?: number
}

const NAME = Symbol.for('drizzle:Name')
const nameOf = (t: unknown): string => (typeof t === 'string' ? t : (t as any)?.[NAME] ?? (() => { throw new StartError('R017', `\`dbChanges\` got something that isn't a table: ${String(t)}`, 'pass Drizzle tables, or their names') })())

const CORE = { sqlite: 'sqlite-core', postgresql: 'pg-core', mysql: 'mysql-core' }

/** A table's primary key columns, from its Drizzle definition. */
async function pkOf(table: any, dialect: DbHandle['dialect']): Promise<string[]> {
  const { getTableConfig } = await import(/* @vite-ignore */ `drizzle-orm/${CORE[dialect]}`)
  const { columns, primaryKeys } = getTableConfig(table)
  const inline = columns.filter((c: any) => c.primary).map((c: any) => c.name)
  return inline.length ? inline : (primaryKeys[0]?.columns ?? []).map((c: any) => c.name)
}

/** `realtime({ changes: dbChanges(db, [todos, notes]) })`: these tables' writes reach `.live`, whoever made them. */
export function dbChanges(db: { $weft?: DbHandle }, tables: unknown[], options: ChangeOptions = {}): Source {
  const handle = db?.$weft
  if (!handle?.changes) throw new StartError('R017', '`dbChanges` needs a client from `@weft/start/db/sqlite`, `/postgres` or `/mysql`', 'for MongoDB use `mongoChanges` from `@weft/db/mongo`; for another client, write a `Source`')
  const names = tables.map(nameOf)
  let source: Promise<Omit<Source, 'name' | 'tables'>> | undefined
  const load = () => (source ??= handle.changes!(names, options))
  return {
    name: handle.dialect,
    dialect: handle.dialect,
    tables: names,
    external: options.listener === 'external',
    tagged: options.tagged,
    defs: () => Promise.all(tables.map(async t => ({ name: nameOf(t), pk: typeof t === 'string' ? [] : await pkOf(t, handle.dialect) }))),
    probe: () => load().then(s => s.probe()),
    start: (sink, probe) => load().then(s => s.start(sink, probe)),
    settle: tags => load().then(s => s.settle?.(tags)),
  }
}

/** Set by a platform, read at run time: this process lives for one request. */
export function functionHost(env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {}): string | undefined {
  if (env.VERCEL) return 'Vercel'
  if (env.NETLIFY || env.NETLIFY_LOCAL) return 'Netlify'
  if (env.AWS_LAMBDA_FUNCTION_NAME) return 'AWS Lambda'
  if (env.AZURE_FUNCTIONS_ENVIRONMENT) return 'Azure Functions'
  if (env.FUNCTION_TARGET) return 'Cloud Functions'
  if ((globalThis as any).navigator?.userAgent === 'Cloudflare-Workers') return 'Cloudflare Workers'
}

export interface Poke { t: string[]; /** Tag prefixes: `todos:` for every row of a table-level change. */ p?: string[]; /** Tags a barrier covered: a subscription with one of them is poked already. */ k?: string[] }

export interface FeedOut {
  emit(poke: Poke): void
  /** Bumps the shared cache, so a refetch can't be answered with what the change made stale. */
  bump?(tags: string[]): void
  status(down: string | undefined): void
}

export interface Feed {
  start(probe: Probe): Promise<void>
  stop(): Promise<void>
  /** Before a mutation's poke. Never throws: a dead feed must not fail a write that committed. */
  settle(tags: string[]): Promise<void>
  covers(tag: string): boolean
  readonly running: boolean
}

const unref = <T,>(t: T) => ((t as any)?.unref?.(), t)

export function createFeed(source: Source, out: FeedOut, { hold = source.hold ?? 25, throttle = 250, barrier = 1000 } = {}): Feed {
  const known = new Set(source.tables)
  let pending = new Set<string>(), prefixes = new Set<string>(), covered = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = 0
  let first: number | undefined
  let stopping: (() => unknown) | undefined
  let running = false
  let isDown = false

  const flush = () => {
    timer = first = undefined
    last = Date.now()
    const t = [...pending], p = [...prefixes], k = [...covered]
    pending = new Set()
    prefixes = new Set()
    covered = new Set()
    if (t.length || p.length) out.emit({ t, ...(p.length && { p }), ...(k.length && { k }) })
  }
  /** Each change gets its `hold`, for a barrier to reach it; a writer that never stops gets a flush per `throttle`. */
  const arm = () => {
    const now = Date.now()
    first ??= now
    clearTimeout(timer)
    timer = unref(setTimeout(flush, Math.max(Math.min(hold, first + throttle - now), last + throttle - now)))
  }

  const tagsOf = ({ table, id }: Change) => source.tagged?.({ table, id }) ?? (id === undefined ? [table] : [table, `${table}:${id}`])

  const sink: Sink = {
    changes(list) {
      const seen: string[] = []
      for (const c of list) {
        if (!known.has(c.table)) continue
        for (const t of tagsOf(c)) {
          pending.add(t)
          covered.delete(t) // a change after the barrier: no poke covers it
          seen.push(t)
        }
        if (c.id === undefined) prefixes.add(`${c.table}:`)
      }
      if (!seen.length) return
      out.bump?.(seen)
      arm()
    },
    settled(tags) {
      for (const t of tags) {
        if (pending.delete(t)) covered.add(t)
        else if (prefixes.delete(`${t}:`)) covered.add(t)
      }
      if (pending.size || prefixes.size) return
      clearTimeout(timer)
      timer = first = undefined
      covered = new Set()
    },
    lost() {
      sink.changes(source.tables.map(table => ({ table })))
    },
    down(why) {
      if (isDown) return
      isDown = true
      out.status(why)
    },
    up() {
      if (!isDown) return
      isDown = false
      out.status(undefined)
    },
  }

  return {
    get running() { return running },
    covers(tag) {
      const at = tag.indexOf(':')
      return known.has(at < 0 ? tag : tag.slice(0, at))
    },
    async start(probe) {
      if (running) return
      running = true
      try {
        stopping = await source.start(sink, probe)
      } catch (e) {
        running = false
        throw e
      }
    },
    async stop() {
      clearTimeout(timer)
      timer = undefined
      running = false
      const stop = stopping
      stopping = undefined
      await stop?.()
    },
    async settle(tags) {
      const ours = tags.filter(t => this.covers(t))
      if (!ours.length || !source.settle) return
      let late: ReturnType<typeof setTimeout> | undefined
      await Promise.race([source.settle(ours), new Promise<void>(ok => (late = unref(setTimeout(ok, barrier))))]).catch(() => {})
      clearTimeout(late)
    },
  }
}
