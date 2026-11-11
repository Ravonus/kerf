// A list source over a Prisma model delegate: `prismaSource(ctx.db.task, { columns })`. It only reads what a delegate
// has, so it needs nothing from `@prisma/client` and works with any generated client.

import {
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

/** What a generated client's model has, whatever its schema. */
export interface PrismaDelegate {
  findMany(args: unknown): Promise<object[]>
  findUnique(args: unknown): Promise<object | null>
  count(args: unknown): Promise<number>
  create(args: unknown): Promise<object>
  update(args: unknown): Promise<object>
  delete(args: unknown): Promise<object>
}

/** A source's allowlist, and how `search` compares. */
export interface PrismaSpec extends SourceSpec {
  /** `mode: 'insensitive'` on `contains`, which Postgres and Mongo have. SQLite and MySQL compare without case already. Default true. */
  insensitive?: boolean
}

const MISSING = 'P2025'

type PrismaList<Row> = {
  model: PrismaDelegate
  spec: PrismaSpec
  select: Record<string, boolean>
  idColumn: string
  reading: (row: object) => Row
  escaped: boolean
}

async function listRows<Row>(p: ListParams, context: PrismaList<Row>) {
  const { model, spec, select, idColumn, reading, escaped } = context
  const q = plan(spec, p)
  const and: object[] = q.where.map((w) => {
    const some = w.values.filter((v) => v !== null)
    return {
      OR: [
        ...(some.length ? [{ [w.column]: { in: some } }] : []),
        ...(w.values.includes(null) ? [{ [w.column]: null }] : []),
      ],
    }
  })
  if (q.search) {
    const term = q.search.text.replace(/[\\%_]/g, '\\$&')
    and.push({
      OR: q.search.columns.map((c) => ({
        [c]: { contains: term, ...(escaped ? { mode: 'insensitive' } : {}) },
      })),
    })
  }
  const where = { AND: and }
  const dir = q.sort?.dir === 'desc' ? 'desc' : 'asc',
    cmp = dir === 'desc' ? 'lt' : 'gt'
  const keyset = p.after
    ? q.sort
      ? {
          OR: [
            { [q.sort.column]: { [cmp]: p.after[0] } },
            { [q.sort.column]: p.after[0], [idColumn]: { [cmp]: p.after[1] } },
          ],
        }
      : { [idColumn]: { gt: p.after[1] } }
    : undefined
  const orderBy = q.sort ? [{ [q.sort.column]: dir }, { [idColumn]: dir }] : [{ [idColumn]: 'asc' }]
  const cursor = p.mode === 'cursor'
  const rows = (
    await model.findMany({
      select,
      where: keyset ? { AND: [where, keyset] } : where,
      orderBy,
      take: cursor ? p.limit + 1 : p.limit,
      skip: p.offset,
    })
  ).map(reading)
  return pageOf(
    rows,
    p,
    { sort: q.sort?.field, id: q.id.field },
    cursor ? undefined : await model.count({ where }),
  )
}

/** A `ListSource` over one Prisma model. */
export function prismaSource<Row = Record<string, unknown>>(
  model: PrismaDelegate,
  spec: PrismaSpec,
): ListSource<Row> {
  const select = Object.fromEntries(Object.values(spec.columns).map((c) => [c, true]))
  const reading = rowOf<Row>(spec)
  const idColumn = storedId(spec)
  const missing = (e: unknown) => {
    if ((e as { code?: string } | null)?.code !== MISSING) throw e
    return null
  }
  // Prisma leaves `%` and `_` as wildcards in `contains`, so a term with either is checked again here.
  const escaped = spec.insensitive !== false
  return {
    limits: { search: 'cased' },
    list(p: ListParams) {
      return listRows(p, { model, spec, select, idColumn, reading, escaped })
    },
    get: async (id) => {
      const r = await model.findUnique({ where: { [idColumn]: id }, select })
      return r ? reading(r) : null
    },
    create: async (data) =>
      reading(await model.create({ data: written(spec, data, true), select })),
    update: (id, patch) => {
      const data = written(spec, patch)
      return model.update({ where: { [idColumn]: id }, data, select }).then(reading, missing)
    },
    remove: (id) =>
      model.delete({ where: { [idColumn]: id }, select: { [idColumn]: true } }).then(
        () => true,
        (e) => missing(e) ?? false,
      ),
  }
}

/** `db.adapter@1` over a Prisma model. */
export const adapter: DbAdapter<PrismaDelegate> = {
  name: 'prisma',
  source: (t, spec) => prismaSource(t, spec),
}
