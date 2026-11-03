// The `db.adapter@1` default (research 13 §2.2): a list source over a Drizzle table. `columns` keeps its meaning here,
// so a table's other columns stay out of what's selected, returned or written.

import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql, type Column, type SQL } from 'drizzle-orm'
import { likeOf, pageOf, plan, rowOf, storedId, written, type DbAdapter, type ListPage, type ListParams, type ListSource, type SourceSpec } from './list'

/** The Drizzle client and table a list source runs on. */
export interface DrizzleTarget { db: object; table: object }

/** What every dialect's query builders share by name, though no type says so. */
type Chain = PromiseLike<object[]> & { from(t: object): Chain; where(w?: SQL): Chain; orderBy(...o: SQL[]): Chain; limit(n: number): Chain; offset(n: number): Chain; values(v: object): Chain; set(v: object): Chain; returning(s?: object): Chain }
interface Db { select(s: object): Chain; insert(t: object): Chain; update(t: object): Chain; delete(t: object): Chain }

/** A `ListSource` over a Drizzle table. */
export function drizzleSource<Row = Record<string, unknown>>({ db: handle, table }: DrizzleTarget, spec: SourceSpec): ListSource<Row> {
  const db = handle as Db
  const col = (name: string) => (table as Record<string, Column>)[name]!
  const selection = Object.fromEntries(Object.values(spec.columns).map(c => [c, col(c)]))
  const public_ = rowOf<Row>(spec)
  const id = col(storedId(spec))
  const reading = (rows: object[]) => rows.map(public_)
  const one = async (query: Chain) => reading(await query)[0] ?? null
  return {
    async list(p: ListParams): Promise<ListPage<Row>> {
      const q = plan(spec, p)
      const filters: (SQL | undefined)[] = q.where.map(w => {
        const some = w.values.filter(v => v !== null)
        const hit = some.length === 1 ? eq(col(w.column), some[0]) : some.length ? inArray(col(w.column), some) : undefined
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
      const total = cursor ? undefined : ((await db.select({ n: count() }).from(table).where(where)) as { n: number }[])[0]!.n
      return pageOf(reading(rows), p, { sort: q.sort?.field, id: q.id.field }, total)
    },
    get: id_ => one(db.select(selection).from(table).where(eq(id, id_)).limit(1)),
    create: async data => (await one(db.insert(table).values(written(spec, data, true)).returning(selection)))!,
    update: (id_, patch) => { const row = written(spec, patch); return one(Object.keys(row).length ? db.update(table).set(row).where(eq(id, id_)).returning(selection) : db.select(selection).from(table).where(eq(id, id_)).limit(1)) },
    remove: async id_ => (await db.delete(table).where(eq(id, id_)).returning({ id })).length > 0,
  }
}

/** `db.adapter@1` over a Drizzle table. */
export const adapter: DbAdapter<DrizzleTarget> = { name: 'drizzle', source: drizzleSource }
