import type postgres from 'postgres'
import type { Link } from '../verify'

export class Broke extends Error {
  constructor(
    public link: Link,
    why: string,
  ) {
    super(why)
  }
}

export const clean = (s: unknown) =>
  String((s as Error | null | undefined)?.message ?? s).replace(/\/\/[^@/\s]*@/g, '//…@')

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

export async function insert(
  sql: postgres.Sql,
  table: string,
  marker: string,
  row: Record<string, unknown>,
  pk: string[],
) {
  const cols =
    await sql`select column_name, data_type, is_nullable, column_default, is_identity, is_generated from information_schema.columns where table_schema = current_schema() and table_name = ${table} order by ordinal_position`
  if (!cols.length) throw new Broke('write', `no table \`${table}\` in this database`)
  const values: Record<string, unknown> = { ...row }
  let marked = false
  for (const c of cols) {
    const name = c.column_name as string
    if (name in values) continue
    if (/char|text/.test(c.data_type) && !marked) {
      values[name] = marker
      marked = true
    } else if (
      c.is_nullable === 'NO' &&
      c.column_default === null &&
      c.is_identity === 'NO' &&
      c.is_generated === 'NEVER'
    )
      values[name] = made(c.data_type, marker)
  }
  if (!marked)
    throw new Broke(
      'write',
      `\`${table}\` has no free text column to mark a row with: name one less in \`row\``,
    )
  const names = Object.keys(values)
  const quoted = (n: string) => `"${n.replaceAll('"', '""')}"`
  const key = pk.length ? pk : names.slice(0, 1)
  const [got] = await sql.unsafe(
    `insert into ${quoted(table)} (${names.map(quoted).join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning ${key.map(quoted).join(', ')}`,
    names.map((n) => values[n]) as never[],
  )
  if (!got) throw new Broke('write', `\`${table}\` took the row and returned nothing`)
  const where = key.map((k, i) => `${quoted(k)} = $${i + 1}`).join(' and ')
  return {
    id: key.map((k) => String(got[k])).join(':'),
    remove: () =>
      sql.unsafe(
        `delete from ${quoted(table)} where ${where}`,
        key.map((k) => got[k]),
      ),
  }
}

export async function primaryKey(sql: postgres.Sql, table: string): Promise<string[]> {
  const rows =
    await sql`select a.attname from pg_index i join pg_class c on c.oid = i.indrelid join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey) where c.relname = ${table} and i.indisprimary`
  return rows.map((r) => r.attname as string)
}

/** One SSE connection to the app, by the protocol a browser's tab speaks. */
type Frame = [event: string, data: unknown]
export type Hello = { l?: { m?: string; d?: unknown } }

export async function subscribe(
  url: string,
  id: string,
  input: unknown,
  cookie: string | undefined,
  signal: AbortSignal,
) {
  const res = await fetch(`${url}/_weft/rt`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-weft': '1',
      accept: 'text/event-stream',
      origin: url,
      ...(cookie && { cookie }),
    },
    body: JSON.stringify({ s: [[1, 'q', id, input]] }),
  })
  if (!res.ok) throw new Error(`\`/_weft/rt\` answered ${res.status}`)
  const frames: Frame[] = []
  const waiting = new Set<() => void>()
  void (async () => {
    const dec = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
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
  const until = async (test: (f: Frame) => boolean, ms: number) => {
    const end = Date.now() + ms
    for (;;) {
      const hit = frames.find(test)
      if (hit) return hit
      const left = end - Date.now()
      if (left <= 0) return undefined
      await new Promise<void>((ok) => {
        const t = setTimeout(ok, left)
        waiting.add(() => {
          clearTimeout(t)
          ok()
        })
      })
      waiting.clear()
    }
  }
  return { frames, until }
}

export const read = (url: string, id: string, input: unknown, cookie?: string) =>
  fetch(
    `${url}/_weft/fn/${id}${input == null ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`,
    { headers: { accept: 'application/json', ...(cookie && { cookie }) } },
  )
