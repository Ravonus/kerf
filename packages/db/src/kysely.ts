// A list source over Kysely. The types say nothing here: `table` and `columns` are strings, so Kysely's `dynamic`-free
// builder gets them from the spec, never from a request.

import type { Kysely } from 'kysely'
import { likeOf, pageOf, plan, rowOf, written, type DbAdapter, type ListParams, type ListSource, type SourceSpec } from '@weft-js/start/list'
import { StartError } from '@weft-js/start/data'
import { driver } from './driver'

const { sql } = await driver('@weft-js/db/kysely', 'kysely', () => import('kysely'))

export interface KyselySpec extends SourceSpec {
  table: string
  /** MySQL has no `returning`. Default true. */
  returning?: boolean
}

export function kyselySource<Row = Record<string, unknown>>(db: Kysely<any>, spec: KyselySpec): ListSource<Row> {
  const { table, returning = true } = spec
  const columns = Object.values(spec.columns)
  const reading = rowOf(spec)
  const idColumn = spec.columns[spec.id ?? 'id']
  const byId = async (id: unknown) => {
    const r = await db.selectFrom(table).select(columns).where(idColumn, '=', id).executeTakeFirst()
    return r ? (reading(r) as Row) : null
  }
  return {
    async list(p: ListParams) {
      const q = plan(spec, p)
      const filtered = (b: any) => {
        for (const w of q.where) {
          const some = w.values.filter(v => v !== null)
          b = b.where((eb: any) => eb.or([...(some.length ? [eb(w.column, 'in', some)] : []), ...(w.values.includes(null) ? [eb(w.column, 'is', null)] : [])]))
        }
        if (q.search) {
          const like = likeOf(q.search.text)
          b = b.where((eb: any) => eb.or(q.search!.columns.map(c => sql<boolean>`lower(${sql.ref(c)}) like ${like} escape '!'`)))
        }
        return b
      }
      let b = filtered(db.selectFrom(table).select(columns))
      const dir = q.sort?.dir === 'desc' ? 'desc' : 'asc', cmp = dir === 'desc' ? '<' : '>'
      if (p.after) {
        const [value, id] = p.after
        b = b.where((eb: any) => (q.sort ? eb.or([eb(q.sort.column, cmp, value), eb.and([eb(q.sort.column, '=', value), eb(idColumn, cmp, id)])]) : eb(idColumn, '>', id)))
      }
      b = q.sort ? b.orderBy(q.sort.column, dir).orderBy(idColumn, dir) : b.orderBy(idColumn, 'asc')
      const cursor = p.mode === 'cursor'
      const rows = (await b.limit(cursor ? p.limit + 1 : p.limit).offset(p.offset).execute()).map(reading) as Row[]
      const total = cursor ? undefined : Number((await filtered(db.selectFrom(table).select(sql<number>`count(*)`.as('n'))).executeTakeFirstOrThrow()).n)
      return pageOf(rows, p, { sort: q.sort?.field, id: q.id.field }, total)
    },
    get: byId,
    async create(data) {
      const row = written(spec, data, true)
      const id = row[idColumn]
      if (returning) return reading(await db.insertInto(table).values(row).returning(columns).executeTakeFirstOrThrow()) as Row
      if (id === undefined) throw new StartError('Q002', '`create` needs the id: MySQL can\'t return a row', 'generate it before the insert')
      await db.insertInto(table).values(row).execute()
      return (await byId(id))!
    },
    async update(id, patch) {
      const row = written(spec, patch)
      if (returning) {
        const r = await db.updateTable(table).set(row).where(idColumn, '=', id).returning(columns).executeTakeFirst()
        return r ? (reading(r) as Row) : null
      }
      if (!(await byId(id))) return null
      await db.updateTable(table).set(row).where(idColumn, '=', id).execute()
      return byId(id)
    },
    async remove(id) {
      return (await db.deleteFrom(table).where(idColumn, '=', id).executeTakeFirst()).numDeletedRows > 0n
    },
  }
}

export const adapter: DbAdapter<Kysely<any>> = { name: 'kysely', source: (t, spec) => kyselySource(t, spec as KyselySpec) }
