// The `db.adapter@1` default (research 13 §2.2): a list source over a Drizzle table. `columns` keeps its meaning here,
// so a table's other columns stay out of what's selected, returned or written.

import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { likeOf, pageOf, plan, rowOf, written, type DbAdapter, type ListPage, type ListParams, type ListSource, type SourceSpec } from './list'

export interface DrizzleTarget { db: any; table: any }

export function drizzleSource<Row = Record<string, unknown>>({ db, table }: DrizzleTarget, spec: SourceSpec): ListSource<Row> {
  const col = (name: string) => table[name]
  const selection = Object.fromEntries(Object.values(spec.columns).map(c => [c, col(c)]))
  const public_ = rowOf(spec)
  const id = col(spec.columns[spec.id ?? 'id'])
  const reading = (rows: any[]) => rows.map(public_) as Row[]
  const one = async (query: any) => reading(await query)[0] ?? null
  return {
    async list(p: ListParams): Promise<ListPage<Row>> {
      const q = plan(spec, p)
      const filters: (SQL | undefined)[] = q.where.map(w => {
        const some = w.values.filter(v => v !== null)
        const hit = some.length === 1 ? eq(col(w.column), some[0]) : some.length ? inArray(col(w.column), some as any[]) : undefined
        return w.values.includes(null) ? or(hit, isNull(col(w.column))) : hit
      })
      if (q.search) filters.push(or(...q.search.columns.map(c => sql`lower(${col(c)}) like ${likeOf(q.search!.text)} escape '!'`)))
      const where = and(...filters)
      const by = q.sort?.dir === 'desc' ? desc : asc
      const past = q.sort?.dir === 'desc' ? lt : gt
      const keyset = p.after ? (q.sort ? or(past(col(q.sort.column), p.after[0]), and(eq(col(q.sort.column), p.after[0]), past(id, p.after[1]))) : past(id, p.after[1])) : undefined
      const order = q.sort ? [by(col(q.sort.column)), by(id)] : [asc(id)]
      const cursor = p.mode === 'cursor'
      const rows = await db.select(selection).from(table).where(and(where, keyset)).orderBy(...order).limit(cursor ? p.limit + 1 : p.limit).offset(p.offset)
      const total = cursor ? undefined : (await db.select({ n: count() }).from(table).where(where))[0].n
      return pageOf(reading(rows), p, { sort: q.sort?.field, id: q.id.field }, total)
    },
    get: id_ => one(db.select(selection).from(table).where(eq(id, id_)).limit(1)),
    create: async data => (await one(db.insert(table).values(written(spec, data, true)).returning(selection)))!,
    update: (id_, patch) => one(db.update(table).set(written(spec, patch)).where(eq(id, id_)).returning(selection)),
    remove: async id_ => (await db.delete(table).where(eq(id, id_)).returning({ id })).length > 0,
  }
}

export const adapter: DbAdapter<DrizzleTarget> = { name: 'drizzle', source: drizzleSource }
