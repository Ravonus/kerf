// What every data layer shares (research 28 §2, 34 §4): the gate that applies the server's migrations before a database's
// first statement, and the touched-tables record behind Q011. A provider is any client with a `$weft` handle made through
// `register`. No driver imports, so `@weft/start/db/sqlite` doesn't load Postgres, or the other way round.

import { currentScope, runtime, StartError } from '../data'

export interface Migration { tag: string; sql: string }

export interface DbHandle {
  dialect: 'sqlite' | 'postgresql' | 'mysql'
  /** Apply what's new in `list`, in order. */
  migrate(list: Migration[]): Promise<void>
  /** Tables Q011 doesn't report (Better Auth's). */
  exempt: Set<string>
}

/** Attach weft's handle to a client. */
export const register = <D extends object>(db: D, handle: DbHandle): D & { $weft: DbHandle } => Object.assign(db, { $weft: handle })

/** The database can't be used: its connection, or a migration it needs. The client sees this; the server log gets the cause. */
export const unavailable = (cause: unknown) =>
  new StartError('Q016', 'the database is unavailable, or a migration failed', 'start it and check `DATABASE_URL`; the server log has the driver\'s error', { status: 503, cause })

/**
 * What a provider awaits before each statement, or its connection call: resolved once the list the server's first request
 * set (`runtime.migrations`) is applied, so a request that touches no database never needs one. Concurrent callers share
 * one run; a failed run is retried by the next caller, so a database that comes back needs no restart. Before a request
 * (`weft build`, scripts) and with `migrate: false` there's nothing to wait for.
 */
export function gate(handle: DbHandle, migrate: boolean) {
  let applied: unknown
  let run: Promise<void> = Promise.resolve()
  return (): Promise<void> | undefined => {
    const m = runtime.migrations
    if (!migrate || !m) return undefined
    if (m !== applied) {
      applied = m
      run = run.catch(() => {}).then(() => handle.migrate(m.list)).catch(e => {
        if (applied === m) applied = undefined
        m.report(e)
        throw unavailable(e)
      })
    }
    return run
  }
}

/** Dev: record a statement's tables in the running function's frame. Identifiers may be quoted, as Drizzle's always are. */
export function touch(handle: DbHandle, sql: string) {
  const t = currentScope()?.touched
  if (!t) return
  const target = /^\s*(?:insert\s+into|update|delete\s+from)\s+(?:["`]?\w+["`]?\.)?["`]?([\w$]+)/i.exec(sql)?.[1]
  if (target && !handle.exempt.has(target)) t.write.add(target)
  for (const m of sql.matchAll(/\b(?:from|join)\s+(?:["`]?\w+["`]?\.)?["`]?([\w$]+)/gi)) if (m[1] !== target && !handle.exempt.has(m[1])) t.read.add(m[1])
}

/** A migration file's statements (drizzle-kit separates them with this marker). */
export const statements = (sql: string) => sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
