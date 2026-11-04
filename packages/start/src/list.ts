// The list contract: one way to ask for a page or a cursor, whatever holds
// the rows. `listInput` is a schema a `query` takes as its `input`, and a source is what the `@weft-js/db` subpaths build.
//
//   export const tasks = query({
//     input: listInput({ sort: ['rank', 'title'], filter: ['status'], search: ['title'], pageSize: { default: 25, max: 100 } }),
//     run: ({ input }) => Tasks.list(input),
//   })
//
// Every name a client sends is checked against an allowlist twice, here and against the source's `columns`, so no
// request reaches an identifier. A filter value is a scalar or a list of them: an object is refused, which
// is what stops `{ $ne: null }` reaching a document store. Only `columns` are selected, returned or written.

import { StartError, type StandardSchemaV1 } from './data'

/** One value a filter can hold. */
export type Scalar = string | number | boolean | null
/** Which way a sort runs. */
export type Dir = 'asc' | 'desc'
/** One field and a direction. */
export interface Sort {
  field: string
  dir: Dir
}

/** A checked request, as a source takes it. */
export interface ListParams {
  mode: 'page' | 'cursor'
  limit: number
  /** Rows to skip, in `page` mode. */
  offset: number
  /** The position to continue after, in `cursor` mode: the last row's sort value and id. */
  after: [value: unknown, id: unknown] | null
  sort: Sort | null
  search?: string
  /** A list means any of them. `null` means the field is empty. */
  filter: Record<string, Scalar | Scalar[]>
}

/** The envelope warp's `Table` reads. `next` and `prev` go back in as `cursor` or `page`; absent means no such page. */
export interface ListPage<T> {
  items: T[]
  total?: number
  next?: string | number
  prev?: string | number
}

/** What a list lets a client ask for. */
export interface ListSpec {
  /** Required, even empty: nothing is sortable, filterable or searchable by default. */
  sort: readonly string[]
  filter: readonly string[]
  search?: readonly string[]
  defaultSort?: Sort
  pageSize?: { default?: number; max?: number }
}

/** What a client sends: every field is checked by `listInput`. */
export interface ListRequest {
  mode?: 'page' | 'cursor'
  page?: number
  pageSize?: number
  cursor?: string | null
  sort?: Sort | null
  search?: string
  filter?: Record<string, Scalar | Scalar[]>
}

const SEARCH_MAX = 200,
  IN_MAX = 100,
  CURSOR_MAX = 1024

const scalar = (v: unknown): v is Scalar =>
  v === null ||
  typeof v === 'boolean' ||
  typeof v === 'string' ||
  (typeof v === 'number' && Number.isFinite(v))

const pack = (v: unknown) => (v instanceof Date ? { $d: v.toISOString() } : v)
const stamped = (v: unknown): v is { $d: string } =>
  typeof (v as { $d?: unknown } | null)?.$d === 'string'
const unpack = (v: unknown) => (stamped(v) ? new Date(v.$d) : v)

/** Opaque to a client, and read with the same care as any other input. */
export function encodeCursor(value: unknown, id: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify([pack(value), pack(id)]))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** The other way from `encodeCursor`: null for anything that isn't a cursor of ours. */
export function decodeCursor(text: string): [unknown, unknown] | null {
  if (text.length > CURSOR_MAX) return null
  try {
    const bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
      c.charCodeAt(0),
    )
    const list: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const fits = (v: unknown) => scalar(v) || (stamped(v) && !Number.isNaN(Date.parse(v.$d)))
    return Array.isArray(list) && list.length === 2 && list.every(fits)
      ? [unpack(list[0]), unpack(list[1])]
      : null
  } catch {
    return null
  }
}

/** A `query`'s `input`. Takes a `ListRequest` from the client, and hands `run` the `ListParams` a source takes. */
export function listInput(spec: ListSpec): StandardSchemaV1<ListRequest | undefined, ListParams> {
  const fallback = spec.pageSize?.default ?? 25,
    max = spec.pageSize?.max ?? 100
  const sorts = new Set(spec.sort),
    filters = new Set(spec.filter)
  const validate = (input: unknown) => {
    const issues: { message: string; path?: string[] }[] = []
    const no = (message: string, ...path: string[]) => void issues.push({ message, path })
    const r = (input ?? {}) as ListRequest
    if (typeof r !== 'object' || Array.isArray(r))
      return { issues: [{ message: 'a list request is an object' }] }
    const mode = r.mode ?? (r.cursor !== undefined ? 'cursor' : 'page')
    if (mode !== 'page' && mode !== 'cursor') no('`mode` is `page` or `cursor`', 'mode')
    const size = r.pageSize ?? fallback
    if (!Number.isInteger(size) || size < 1 || size > max)
      no(`\`pageSize\` is a whole number up to ${max}`, 'pageSize')
    const page = r.page ?? 1
    if (!Number.isInteger(page) || page < 1 || page > 1e6)
      no('`page` is a whole number from 1', 'page')
    let after: ListParams['after'] = null
    if (r.cursor != null) {
      after = typeof r.cursor === 'string' ? decodeCursor(r.cursor) : null
      if (!after) no('that cursor is not one of ours', 'cursor')
    }
    const sort = r.sort ?? spec.defaultSort ?? null
    if (
      sort &&
      !(
        typeof sort === 'object' &&
        sorts.has(sort.field) &&
        (sort.dir === 'asc' || sort.dir === 'desc')
      )
    )
      no('that sort is not allowed', 'sort')
    if (r.search !== undefined && (typeof r.search !== 'string' || r.search.length > SEARCH_MAX))
      no(`\`search\` is text up to ${SEARCH_MAX} characters`, 'search')
    if (r.search && !spec.search?.length) no('this list has no search', 'search')
    const filter: ListParams['filter'] = Object.create(null)
    if (
      r.filter !== undefined &&
      (typeof r.filter !== 'object' || r.filter === null || Array.isArray(r.filter))
    )
      no('`filter` is an object', 'filter')
    else
      for (const key of Object.keys(r.filter ?? {})) {
        const v = r.filter![key]!
        if (!filters.has(key)) no(`\`${key}\` can't be filtered on`, 'filter', key)
        else if (
          Array.isArray(v) ? !(v.length && v.length <= IN_MAX && v.every(scalar)) : !scalar(v)
        )
          no(`\`${key}\` takes a value or a list of up to ${IN_MAX}, not an object`, 'filter', key)
        else filter[key] = v
      }
    if (issues.length) return { issues }
    const params: ListParams = {
      mode,
      limit: size,
      offset: mode === 'page' ? (page - 1) * size : 0,
      after,
      sort,
      filter,
      ...(r.search ? { search: r.search } : {}),
    }
    return { value: params }
  }
  return { '~standard': { version: 1, vendor: 'weft', validate } }
}

// ---- sources --------------------------------------------------------------------------------------------------------

/** The allowlist a source reads and writes through. */
export interface SourceSpec {
  /** Public name → stored name. Required: only these are selected, returned or written. */
  columns: Record<string, string>
  /** The public name of the row's id. Default `id`. */
  id?: string
  /** Public names `search` scans. */
  search?: readonly string[]
  /** Public names a write may set. Default every column but the id. */
  write?: readonly string[]
}

/** One table or collection, read and written the same way whatever holds it. */
export interface ListSource<Row = Record<string, unknown>> {
  list(params: ListParams): Promise<ListPage<Row>>
  get(id: unknown): Promise<Row | null>
  create(data: Record<string, unknown>): Promise<Row>
  /** Null when there's no such row. */
  update(id: unknown, patch: Record<string, unknown>): Promise<Row | null>
  remove(id: unknown): Promise<boolean>
  /** What it can't do, so a page can leave the control out. */
  readonly limits?: { page?: false; search?: 'prefix' | 'cased' | false; sort?: readonly string[] }
}

/** `db.adapter@1`: what a provider exports. `target` is the driver's handle: a collection, a table, a query function. */
export interface DbAdapter<T = unknown> {
  readonly name: string
  source<Row = Record<string, unknown>>(target: T, spec: SourceSpec): ListSource<Row>
}

const refuse = (what: string) =>
  new StartError(
    'Q002',
    `the list source refused ${what}`,
    "add it to the source's `columns`, and to `listInput`",
    { status: 400 },
  )

/** A request checked against the source and put in stored names. Throws on any name outside `columns`. */
export interface Plan {
  sort: { column: string; dir: Dir; field: string } | null
  /** The last thing to order by, so rows that tie keep one order across pages. */
  id: { column: string; field: string }
  where: { column: string; values: Scalar[] }[]
  search?: { columns: string[]; text: string }
}

/** Stored name of the row's id. A spec without one can't address a row, so a write can't go nowhere in silence. */
export function storedId(spec: SourceSpec): string {
  const id = spec.id ?? 'id'
  if (!Object.hasOwn(spec.columns, id)) throw refuse(`\`${id}\` as the id`)
  return spec.columns[id]!
}

/** Check a request against `spec`, for a source to run. */
export function plan(spec: SourceSpec, p: ListParams): Plan {
  const stored = (field: string) =>
    Object.hasOwn(spec.columns, field)
      ? spec.columns[field]!
      : (() => {
          throw refuse(`\`${field}\``)
        })()
  const id = spec.id ?? 'id'
  const where = Object.keys(p.filter).map((field) => ({
    column: stored(field),
    values: [p.filter[field]!].flat(),
  }))
  if (where.some((w) => !w.values.every(scalar)))
    throw refuse('a filter value that is not a scalar')
  const searching = p.search ? (spec.search ?? []) : []
  if (p.search && !searching.length) throw refuse('a search')
  return {
    sort: p.sort ? { column: stored(p.sort.field), dir: p.sort.dir, field: p.sort.field } : null,
    id: { column: stored(id), field: id },
    where,
    ...(p.search ? { search: { columns: searching.map(stored), text: p.search } } : {}),
  }
}

/** A stored row in public names, with only `columns` in it. */
export const rowOf = <Row = Record<string, unknown>>(spec: SourceSpec) => {
  const pairs = Object.entries(spec.columns)
  return (row: object) =>
    Object.fromEntries(
      pairs.filter(([, c]) => c in row).map(([f, c]) => [f, (row as Record<string, unknown>)[c]]),
    ) as Row
}

/** A write in stored names. Refuses anything outside `write`, so a client can't set `role` or move an id. */
export function written(
  spec: SourceSpec,
  data: Record<string, unknown>,
  creating = false,
): Record<string, unknown> {
  const id = spec.id ?? 'id'
  const allowed = new Set(spec.write ?? Object.keys(spec.columns).filter((f) => f !== id))
  if (creating) allowed.add(id)
  const out: Record<string, unknown> = {}
  for (const field of Object.keys(data)) {
    if (!allowed.has(field) || !Object.hasOwn(spec.columns, field))
      throw refuse(`a write to \`${field}\``)
    out[spec.columns[field]!] = data[field]
  }
  return out
}

/** `rows` are in public names, with one more than `limit` in cursor mode when there is a next page. */
export function pageOf<R>(
  rows: R[],
  p: ListParams,
  field: { sort?: string | undefined; id: string },
  total?: number,
): ListPage<R> {
  if (p.mode === 'page') {
    const page = p.offset / p.limit + 1
    return {
      items: rows,
      ...(total === undefined ? {} : { total }),
      ...(total !== undefined && p.offset + p.limit < total ? { next: page + 1 } : {}),
      ...(page > 1 ? { prev: page - 1 } : {}),
    }
  }
  const more = rows.length > p.limit
  const items = more ? rows.slice(0, p.limit) : rows
  const last = items.at(-1) as R & Record<string, unknown>
  return {
    items,
    ...(total === undefined ? {} : { total }),
    ...(more
      ? { next: encodeCursor(field.sort ? last[field.sort] : last[field.id], last[field.id]) }
      : {}),
  }
}

/** `LIKE` with `!` as the escape: the one character that means the same on SQLite, Postgres and MySQL. */
export const likeOf = (text: string) => `%${text.replace(/[!%_]/g, '!$&')}%`.toLowerCase()
