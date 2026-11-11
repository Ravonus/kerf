// A list source over Kysely. The types say nothing here: `table` and `columns` are strings, so Kysely's `dynamic`-free
// builder gets them from the spec, never from a request.

import type { ExpressionBuilder, Kysely, SelectQueryBuilder } from 'kysely'
import {
  likeOf,
  pageOf,
  plan,
  rowOf,
  storedId,
  written,
  type DbAdapter,
  type ListParams,
  type ListSource,
  type SourceSpec,
} from '@kerf/start/list'
import { StartError } from '@kerf/start/data'
import { driver } from './driver'

const { sql } = await driver('@kerf/db/kysely', 'kysely', () => import('kysely'))

/** A source's allowlist, its table, and whether the engine can `returning`. */
export interface KyselySpec extends SourceSpec {
  table: string
  /** MySQL has no `returning`. Default true. */
  returning?: boolean
}

type Tables = Record<string, Record<string, unknown>>
type Eb = ExpressionBuilder<Tables, string>

type KyselyList<Row> = {
  db: Kysely<Tables>
  spec: KyselySpec
  table: string
  columns: string[]
  idColumn: string
  reading: (row: object) => Row
}

async function listRows<Row>(p: ListParams, context: KyselyList<Row>) {
  const { db, spec, table, columns, idColumn, reading } = context
  const q = plan(spec, p)
  const filtered = <O>(from: SelectQueryBuilder<Tables, string, O>) => {
    let b = from
    for (const w of q.where) {
      const some = w.values.filter((v) => v !== null)
      b = b.where((eb: Eb) =>
        eb.or([
          ...(some.length ? [eb(w.column, 'in', some)] : []),
          ...(w.values.includes(null) ? [eb(w.column, 'is', null)] : []),
        ]),
      )
    }
    if (q.search) {
      const like = likeOf(q.search.text)
      b = b.where((eb: Eb) =>
        eb.or(
          q.search!.columns.map((c) => sql<boolean>`lower(${sql.ref(c)}) like ${like} escape '!'`),
        ),
      )
    }
    return b
  }
  let b = filtered(db.selectFrom(table).select(columns))
  const dir = q.sort?.dir === 'desc' ? 'desc' : 'asc',
    cmp = dir === 'desc' ? '<' : '>'
  if (p.after) {
    const [value, id] = p.after
    b = b.where((eb: Eb) =>
      q.sort
        ? eb.or([
            eb(q.sort.column, cmp, value),
            eb.and([eb(q.sort.column, '=', value), eb(idColumn, cmp, id)]),
          ])
        : eb(idColumn, '>', id),
    )
  }
  b = q.sort ? b.orderBy(q.sort.column, dir).orderBy(idColumn, dir) : b.orderBy(idColumn, 'asc')
  const cursor = p.mode === 'cursor'
  const rows = (
    await b
      .limit(cursor ? p.limit + 1 : p.limit)
      .offset(p.offset)
      .execute()
  ).map(reading)
  const total = cursor
    ? undefined
    : Number(
        (
          await filtered(
            db.selectFrom(table).select(sql<unknown>`count(*)`.as('n')),
          ).executeTakeFirstOrThrow()
        ).n,
      )
  return pageOf(rows, p, { sort: q.sort?.field, id: q.id.field }, total)
}

/** A `ListSource` over one table of any `Kysely<DB>`. */
export function kyselySource<Row = Record<string, unknown>, DB = unknown>(
  handle: Kysely<DB>,
  spec: KyselySpec,
): ListSource<Row> {
  const db = handle as unknown as Kysely<Tables>
  const { table, returning = true } = spec
  const columns = Object.values(spec.columns)
  const reading = rowOf<Row>(spec)
  const idColumn = storedId(spec)
  const byId = async (id: unknown) => {
    const r = await db.selectFrom(table).select(columns).where(idColumn, '=', id).executeTakeFirst()
    return r ? reading(r) : null
  }
  return {
    list(p: ListParams) {
      return listRows(p, { db, spec, table, columns, idColumn, reading })
    },
    get: byId,
    async create(data) {
      const row = written(spec, data, true)
      const id = row[idColumn]
      if (returning)
        return reading(
          await db.insertInto(table).values(row).returning(columns).executeTakeFirstOrThrow(),
        )
      if (id === undefined)
        throw new StartError(
          'Q002',
          "`create` needs the id: MySQL can't return a row",
          'generate it before the insert',
        )
      await db.insertInto(table).values(row).execute()
      return (await byId(id))!
    },
    async update(id, patch) {
      const row = written(spec, patch)
      if (!Object.keys(row).length) return byId(id)
      if (returning) {
        const r = await db
          .updateTable(table)
          .set(row)
          .where(idColumn, '=', id)
          .returning(columns)
          .executeTakeFirst()
        return r ? reading(r) : null
      }
      if (!(await byId(id))) return null
      await db.updateTable(table).set(row).where(idColumn, '=', id).execute()
      return byId(id)
    },
    async remove(id) {
      return (
        (await db.deleteFrom(table).where(idColumn, '=', id).executeTakeFirst()).numDeletedRows > 0n
      )
    },
  }
}

/** `db.adapter@1` over a table of a Kysely instance. */
export const adapter: DbAdapter<Kysely<unknown>> = {
  name: 'kysely',
  source: (t, spec) => kyselySource(t, spec as KyselySpec),
}
