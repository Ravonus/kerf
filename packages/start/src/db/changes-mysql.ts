// The change feed on MySQL. A trigger can't reach a client and the binlog needs replication rights, so triggers write a
// log and this reads it on a timer: polling, and it says so. An AUTO_INCREMENT id is taken before commit, so a long
// transaction can land behind the mark: each look re-reads a window behind it.

import type { Pool } from 'mysql2/promise'
import { LOG, MAX_IDS } from '../changes-sql.mjs'
import type { Change, Probe, Sink } from '../changes'

const BEHIND = 512
const KEEP_HOURS = 1
const PRUNE = 60_000

interface Options { pool: Pool; tables: string[]; interval?: number }

export function mysqlChanges({ pool, tables, interval = 500 }: Options) {
  async function probe(): Promise<Probe> {
    try {
      const [rows] = await pool.query(`select event_object_table as t from information_schema.triggers where trigger_schema = database() and trigger_name like 'weft\\_changes\\_%\\_upd'`)
      const have = (rows as { t: string }[]).map(r => r.t)
      const missing = tables.filter(t => !have.includes(t))
      if (!missing.length) return { mode: 'feed', via: 'mysql-log', why: `read every ${interval} ms: MySQL can't push` }
      const [grants] = await pool.query('show grants').catch(() => [[]])
      const may = (grants as Record<string, string>[]).some(g => /ALL PRIVILEGES|\bTRIGGER\b/.test(Object.values(g)[0]))
      return { mode: 'off', via: 'none', why: `no trigger on ${missing.map(t => `\`${t}\``).join(', ')}, and MySQL has no counter to fall back on`, fix: may ? 'run `weft db live`, then apply the migration' : 'run `weft db live`, and apply the migration as a user with the TRIGGER privilege' }
    } catch (e: any) {
      return { mode: 'off', via: 'none', why: `the database didn't answer: ${e?.message ?? e}`, fix: 'check `DATABASE_URL`' }
    }
  }

  async function start(sink: Sink, how: Probe) {
    if (how.mode === 'off') return () => {}
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, failed = false, pruned = Date.now()
    const [[{ top }]] = (await pool.query(`select coalesce(max(seq), 0) as top from ${LOG}`)) as any
    let mark = Number(top)
    // What's already there is old news, and needs no poke.
    const [old] = (await pool.query(`select seq from ${LOG} where seq > ?`, [Math.max(0, mark - BEHIND)])) as any
    const seen = new Set<number>((old as { seq: number }[]).map(r => Number(r.seq)))
    const look = async () => {
      if (stopped) return
      try {
        const [rows] = (await pool.query(`select seq, tbl, pk from ${LOG} where seq > ? order by seq limit 5000`, [Math.max(0, mark - BEHIND)])) as any as [{ seq: number; tbl: string; pk: string | null }[]]
        if (failed) {
          failed = false
          sink.lost()
          sink.up()
        }
        const fresh = rows.filter(r => !seen.has(Number(r.seq)))
        const byTable = new Map<string, Set<string> | null>()
        for (const r of fresh) {
          seen.add(Number(r.seq))
          if (r.pk === null) byTable.set(r.tbl, null)
          else if (byTable.get(r.tbl) !== null) {
            const ids = byTable.get(r.tbl) ?? new Set()
            ids.add(r.pk)
            byTable.set(r.tbl, ids.size > MAX_IDS ? null : ids)
          }
          mark = Math.max(mark, Number(r.seq))
        }
        for (const s of seen) if (s <= mark - BEHIND) seen.delete(s)
        const list: Change[] = []
        for (const [table, ids] of byTable) ids ? list.push(...[...ids].map(id => ({ table, id }))) : list.push({ table })
        if (list.length) sink.changes(list)
        if (Date.now() - pruned > PRUNE) {
          pruned = Date.now()
          await pool.query(`delete from ${LOG} where at < now() - interval ${KEEP_HOURS} hour limit 10000`)
        }
      } catch (e: any) {
        failed = true
        sink.down(`MySQL watcher: ${e?.message ?? e}`)
      }
      timer = setTimeout(look, interval)
      ;(timer as any).unref?.()
    }
    await look()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }

  return { probe, start }
}
