// The change feed on SQLite. There is no notify across processes, so this is polling, of the cheapest thing there is:
// `PRAGMA data_version` on a second connection moves when any connection commits, and costs no file read. Only then is
// the triggers' log read. Same host only: WAL's shared memory doesn't cross a network file system.

import { execFileSync } from 'node:child_process'
import { existsSync, statfsSync } from 'node:fs'
import { LOG, MAX_IDS } from '../changes-sql.mjs'
import type { Change, Probe, Sink } from '../changes'
import type { Method } from './sqlite'

interface Conn {
  query(sql: string, params: unknown[], method: Method): unknown
  exec(sql: string): void
  close?(): void
}

// statfs(2) magic numbers: https://man7.org/linux/man-pages/man2/statfs.2.html
const NETWORK = new Set([0x6969 /* nfs */, 0x517b /* smb */, 0xfe534d42 /* smb2 */, 0xff534d42 /* cifs */, 0x65735546 /* fuse */, 0x5346414f /* afs */, 0xc36400 /* ceph */, 0x47504653 /* gpfs */])

/** Whether a file is on a network file system. `exec` and `statfs` are the test's way in. */
export function onNetwork(path: string, { platform = process.platform, statfs = statfsSync, df = (p: string) => execFileSync('df', ['-P', p], { encoding: 'utf8' }) } = {}): boolean {
  try {
    if (platform === 'linux') return NETWORK.has(statfs(path).type)
    const device = df(path).trim().split('\n').at(-1)!.split(/\s+/)[0] ?? ''
    return device.startsWith('//') || /^[^/]+:\//.test(device)
  } catch {
    return false
  }
}

interface Options { path: string; open: (path: string) => Promise<Conn>; tables: string[]; interval?: number }

export function sqliteChanges({ path, open, tables, interval = 100 }: Options) {
  const log = (c: Conn) => (c.query(`select count(*) from sqlite_master where name = '${LOG}'`, [], 'values') as number[][])[0]![0]! > 0
  const triggers = (c: Conn) => (c.query(`select tbl_name from sqlite_master where type = 'trigger' and name like 'weft\\_changes\\_%\\_upd' escape '\\'`, [], 'values') as string[][]).map(r => r[0])
  let tick: (() => void) | undefined, out: Sink | undefined

  async function probe(): Promise<Probe> {
    if (path === ':memory:') return { mode: 'off', via: 'none', why: 'an in-memory database has no other writers, and no second connection could see it', fix: 'use a file to have writes from other processes reach `.live`' }
    if (onNetwork(existsSync(path) ? path : '.')) return { mode: 'off', via: 'none', why: `\`${path}\` is on a network file system: \`data_version\` and WAL don't work across hosts`, fix: 'put the database on a local disk, or move to Postgres' }
    const c = await open(path)
    try {
      const have = log(c) ? triggers(c) : []
      const missing = tables.filter(t => !have.includes(t))
      if (missing.length) return { mode: 'poll', via: 'sqlite-data-version', why: `no trigger on ${missing.map(t => `\`${t}\``).join(', ')}: any commit pokes every table, unrelated ones included`, fix: 'run `weft db live`' }
      return { mode: 'feed', via: 'sqlite-data-version' }
    } finally {
      c.close?.()
    }
  }

  async function start(sink: Sink, how: Probe) {
    if (how.mode === 'off') return () => {}
    const c = await open(path)
    const version = () => (c.query('pragma data_version', [], 'values') as number[][])[0]![0]!
    const usable = how.mode === 'feed'
    const newest = () => (c.query(`select coalesce(max(seq), 0) from ${LOG}`, [], 'values') as number[][])[0]![0]!
    let seq = usable ? newest() : 0
    let at = version()
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = () => {
      const rows = c.query(`select seq, tbl, pk from ${LOG} where seq > ? order by seq`, [seq], 'values') as [number, string, string | null][]
      if (!rows.length) return
      if (rows[0]![0] > seq + 1) sink.lost() // the log moved past us
      const byTable = new Map<string, Set<string> | null>()
      for (const [, table, id] of rows) {
        if (id === null) byTable.set(table, null)
        else if (byTable.get(table) !== null) {
          const ids = byTable.get(table) ?? new Set()
          ids.add(id)
          byTable.set(table, ids.size > MAX_IDS ? null : ids)
        }
      }
      seq = rows.at(-1)![0]
      const list: Change[] = []
      for (const [table, ids] of byTable) ids ? list.push(...[...ids].map(id => ({ table, id }))) : list.push({ table })
      sink.changes(list)
    }
    const look = () => {
      try {
        const now = version()
        if (now === at) return
        at = now
        if (usable) read()
        else sink.changes(tables.map(table => ({ table })))
        sink.up()
      } catch (e) {
        sink.down(`SQLite watcher: ${(e as Error | null)?.message ?? String(e)}`)
      }
    }
    tick = look
    out = sink
    const every = () => {
      look()
      timer = setTimeout(every, interval)
      ;(timer as { unref?(): void }).unref?.()
    }
    every()
    return () => {
      tick = out = undefined
      clearTimeout(timer)
      c.close?.()
    }
  }

  return {
    probe,
    start,
    /** In this process, so the barrier needs no trip: read what's committed now, and let the hub drop what the poke covers. */
    settle(tags: string[]) {
      tick?.()
      out?.settled(tags)
      return Promise.resolve()
    },
  }
}
