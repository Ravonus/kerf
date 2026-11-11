// A list source from bound SQL: `columns` is required, identifiers come only from it, and every value
// is a parameter. `target` is anything with `query(text, params)`: `ctx.db` from `@kerf/db/plugin-native`, or a driver.

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

/** Whatever runs a bound statement, and says which dialect it speaks. */
export interface SqlTarget {
  query(text: string, params: unknown[]): Promise<Record<string, unknown>[]>
  dialect?: 'postgresql' | 'sqlite' | 'mysql'
  $kerf?: { dialect: 'postgresql' | 'sqlite' | 'mysql' }
}

/** A source's allowlist, and the table it covers. */
export interface SqlSpec extends SourceSpec {
  table: string
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function ident(dialect: string) {
  const q = dialect === 'mysql' ? '`' : '"'
  return (name: string) => {
    if (!IDENT.test(name))
      throw new StartError(
        'Q002',
        `\`${name}\` is not a plain identifier, so it can't go in SQL`,
        'use a column name',
      )
    return `${q}${name}${q}`
  }
}

function listSql<Row>({
  target,
  spec,
  q,
  bind,
  read,
  table,
  select,
  idColumn,
}: {
  target: SqlTarget
  spec: SqlSpec
  q: (name: string) => string
  bind: (params: unknown[]) => (value: unknown) => string
  read: (text: string, params: unknown[]) => Promise<Row[]>
  table: string
  select: string
  idColumn: string
}): ListSource<Row>['list'] {
  return async function list(p: ListParams) {
    const qp = plan(spec, p)
    const params: unknown[] = []
    const put = bind(params)
    const parts = qp.where.map((w) => {
      const some = w.values.filter((v) => v !== null)
      const hit =
        some.length === 1
          ? `${q(w.column)} = ${put(some[0])}`
          : some.length
            ? `${q(w.column)} in (${some.map(put).join(', ')})`
            : ''
      return w.values.includes(null) ? `(${hit ? `${hit} or ` : ''}${q(w.column)} is null)` : hit
    })
    if (qp.search) {
      const text = likeOf(qp.search.text)
      parts.push(
        `(${qp.search.columns.map((c) => `lower(${q(c)}) like ${put(text)} escape '!'`).join(' or ')})`,
      )
    }
    const filtered = [...parts],
      mark = params.length // what the count binds: the keyset isn't part of it
    const cmp = qp.sort?.dir === 'desc' ? '<' : '>'
    if (p.after) {
      const [value, id] = p.after
      const col = qp.sort && q(qp.sort.column)
      parts.push(
        col
          ? `(${col} ${cmp} ${put(value)} or (${col} = ${put(value)} and ${idColumn} ${cmp} ${put(id)}))`
          : `${idColumn} > ${put(id)}`,
      )
    }
    const where = (conditions: string[]) =>
      conditions.length ? ` where ${conditions.join(' and ')}` : ''
    const dir = qp.sort?.dir === 'desc' ? 'desc' : 'asc'
    const order = qp.sort ? `${q(qp.sort.column)} ${dir}, ${idColumn} ${dir}` : `${idColumn} asc`
    const cursor = p.mode === 'cursor'
    const counted = params.slice(0, mark)
    const rows = await read(
      `select ${select} from ${table}${where(parts)} order by ${order} limit ${Math.trunc(cursor ? p.limit + 1 : p.limit)} offset ${Math.trunc(p.offset)}`,
      params,
    )
    const total = cursor
      ? undefined
      : Number(
          (await target.query(`select count(*) as n from ${table}${where(filtered)}`, counted))[0]!
            .n,
        )
    return pageOf(rows, p, { sort: qp.sort?.field, id: qp.id.field }, total)
  }
}

/** A `ListSource` over one table, as bound SQL. */
export function sqlSource<Row = Record<string, unknown>>(
  target: SqlTarget,
  spec: SqlSpec,
): ListSource<Row> {
  const dialect = target.dialect ?? target.$kerf?.dialect ?? 'postgresql'
  const q = ident(dialect)
  for (const c of [spec.table, ...Object.values(spec.columns)]) q(c)
  const table = q(spec.table)
  const select = Object.values(spec.columns).map(q).join(', ')
  const reading = rowOf<Row>(spec)
  const idColumn = q(storedId(spec))
  const bind = (params: unknown[]) => (v: unknown) => {
    params.push(v)
    return dialect === 'postgresql' ? `$${params.length}` : '?'
  }
  const read = async (text: string, params: unknown[]) =>
    (await target.query(text, params)).map(reading)
  const byId = (id: unknown) => {
    const params: unknown[] = []
    return read(
      `select ${select} from ${table} where ${idColumn} = ${bind(params)(id)}`,
      params,
    ).then((r) => r[0] ?? null)
  }
  return {
    list: listSql({ target, spec, q, bind, read, table, select, idColumn }),
    get: byId,
    async create(data) {
      const row = written(spec, data, true)
      const id = data[spec.id ?? 'id']
      if (id === undefined)
        throw new StartError(
          'Q002',
          "`create` needs the id: a generated one can't be read back on every dialect",
          'generate it before the insert',
        )
      const keys = Object.keys(row),
        params: unknown[] = [],
        put = bind(params)
      await target.query(
        `insert into ${table} (${keys.map(q).join(', ')}) values (${keys.map((k) => put(row[k])).join(', ')})`,
        params,
      )
      return (await byId(id))!
    },
    async update(id, patch) {
      const row = written(spec, patch),
        params: unknown[] = [],
        put = bind(params)
      const sets = Object.keys(row).map((k) => `${q(k)} = ${put(row[k])}`)
      if (!(await byId(id))) return null
      if (sets.length)
        await target.query(
          `update ${table} set ${sets.join(', ')} where ${idColumn} = ${put(id)}`,
          params,
        )
      return byId(id)
    },
    async remove(id) {
      if (!(await byId(id))) return false
      const params: unknown[] = []
      await target.query(`delete from ${table} where ${idColumn} = ${bind(params)(id)}`, params)
      return true
    },
  }
}

/** `db.adapter@1` over bound SQL. */
export const adapter: DbAdapter<SqlTarget> = {
  name: 'sql',
  source: (t, spec) => sqlSource(t, spec as SqlSpec),
}

/**
 * A trigger so writes from anywhere (cron, psql, another service) reach `.live` queries, on the postgres bus: tags, never
 * rows. Run the text once in a migration.
 */
export function postgresTrigger({
  table,
  id = 'id',
  tag = table,
}: {
  table: string
  id?: string
  tag?: string
}): string {
  const q = ident('postgresql')
  if (!/^[\w:-]+$/.test(tag)) throw new StartError('Q002', `\`${tag}\` can't be a tag in a trigger`)
  const fn = `kerf_poke_${table}`
  return `create or replace function ${q(fn)}() returns trigger language plpgsql as $$
declare row_id text;
begin
  if tg_op = 'DELETE' then row_id := old.${q(id)}::text; else row_id := new.${q(id)}::text; end if;
  perform pg_notify('kerf_bus', '=kerf:poke' || chr(10) || json_build_object('t', json_build_array('${tag}', '${tag}:' || row_id))::text);
  return null;
end $$;
drop trigger if exists ${q(fn)} on ${q(table)};
create trigger ${q(fn)} after insert or update or delete on ${q(table)} for each row execute function ${q(fn)}();
`
}
