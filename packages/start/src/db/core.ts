// What both database drivers share (research 28 §2): the registry the server migrates, and the touched-tables record
// behind Q011. No driver imports, so `@weft/start/db/sqlite` doesn't load Postgres, or the other way round.

import { currentScope, runtime } from '../data'

export interface Migration { tag: string; sql: string }

export interface DbHandle {
  dialect: 'sqlite' | 'postgresql'
  /** Apply what's new in `list`, in order. */
  migrate(list: Migration[]): Promise<void>
  /** Tables Q011 doesn't report (Better Auth's). */
  exempt: Set<string>
}

/** Attach weft's handle to a Drizzle client and register it for the server's first request. */
export function register<D extends object>(db: D, handle: DbHandle, migrate: boolean): D & { $weft: DbHandle } {
  const out = Object.assign(db, { $weft: handle })
  if (migrate) (runtime.dbs ??= new Set()).add(out)
  return out
}

/** Dev: record a statement's tables in the running function's frame. Drizzle always quotes identifiers. */
export function touch(handle: DbHandle, sql: string) {
  const t = currentScope()?.touched
  if (!t) return
  const target = /^\s*(?:insert\s+into|update|delete\s+from)\s+"([^"]+)"/i.exec(sql)?.[1]
  if (target && !handle.exempt.has(target)) t.write.add(target)
  for (const m of sql.matchAll(/\b(?:from|join)\s+"([^"]+)"/gi)) if (m[1] !== target && !handle.exempt.has(m[1])) t.read.add(m[1])
}

/** A migration file's statements (drizzle-kit separates them with this marker). */
export const statements = (sql: string) => sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
