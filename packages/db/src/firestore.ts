// A list source over a Firestore collection (the Admin SDK's `CollectionReference`, or anything shaped like it). The
// document id is the row's id. Firestore can't search inside a string, and a range is one field at a time, so `search`
// is a prefix on the first search column, and can't be combined with another sort.

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
} from '@kerf-js/start/list'
import { StartError } from '@kerf-js/start/data'

const NAME = '__name__',
  HIGH = '',
  IN_MAX = 30

/** One document, read. */
export interface FirestoreDoc {
  id: string
  exists: boolean
  data(): object | undefined
}

/** Where one document lives. */
export interface FirestoreRef {
  get(): Promise<FirestoreDoc>
  create(data: object): Promise<unknown>
  update(data: object): Promise<unknown>
  delete(): Promise<unknown>
}

/** The Admin SDK's query, as far as a list builds one. */
export interface FirestoreQuery {
  where(field: string, op: never, value: unknown): FirestoreQuery
  orderBy(field: string, dir: 'asc' | 'desc'): FirestoreQuery
  startAfter(...values: unknown[]): FirestoreQuery
  offset(n: number): FirestoreQuery
  limit(n: number): FirestoreQuery
  count(): { get(): Promise<{ data(): { count: number } }> }
  get(): Promise<{ docs: FirestoreDoc[] }>
}

/** The Admin SDK's `CollectionReference`, as far as a source calls it. */
export interface FirestoreCollection {
  select(...fields: string[]): FirestoreQuery
  doc(id?: string): FirestoreRef
}

type FirestoreList<Row> = {
  collection: FirestoreCollection
  spec: SourceSpec
  stored: string[]
  idColumn: string
  idField: string
  row: (doc: FirestoreDoc) => Row
}

async function listRows<Row>(p: ListParams, context: FirestoreList<Row>) {
  const { collection, spec, stored, idColumn, idField, row } = context
  const q = plan(spec, p)
  let b = collection.select(...stored)
  for (const w of q.where) {
    if (w.values.length > IN_MAX)
      throw new StartError('Q002', `Firestore takes ${IN_MAX} values in a filter`, 'ask for fewer')
    b =
      w.values.length === 1
        ? b.where(w.column, '==' as never, w.values[0])
        : b.where(w.column, 'in' as never, w.values)
  }
  let first = q.sort?.column === idColumn ? null : (q.sort?.column ?? null)
  const dir = q.sort?.dir ?? 'asc'
  if (q.search) {
    const field = q.search.columns[0]!
    if (first && first !== field)
      throw new StartError(
        'Q002',
        "Firestore can't search one field and sort by another",
        'drop one',
      )
    first = field
    b = b
      .where(field, '>=' as never, q.search.text)
      .where(field, '<=' as never, q.search.text + HIGH)
  }
  const counted = b
  if (first) b = b.orderBy(first, dir)
  b = b.orderBy(NAME, dir)
  if (p.after) b = first ? b.startAfter(p.after[0], p.after[1]) : b.startAfter(p.after[1])
  const cursor = p.mode === 'cursor'
  if (p.offset) b = b.offset(p.offset)
  const rows = (await b.limit(cursor ? p.limit + 1 : p.limit).get()).docs.map(row)
  const total = cursor ? undefined : (await counted.count().get()).data().count
  return pageOf(
    rows,
    p,
    {
      sort:
        q.sort?.field ??
        (first ? Object.keys(spec.columns).find((k) => spec.columns[k] === first) : undefined),
      id: idField,
    },
    total,
  )
}

/** A `ListSource` over one collection, keyed by document id. */
export function firestoreSource<Row = Record<string, unknown>>(
  collection: FirestoreCollection,
  spec: SourceSpec,
): ListSource<Row> {
  const reading = rowOf<Row>(spec)
  const idField = spec.id ?? 'id',
    idColumn = storedId(spec)
  const stored = Object.values(spec.columns).filter((c) => c !== idColumn)
  const row = (doc: FirestoreDoc) => reading({ [idColumn]: doc.id, ...doc.data() })
  const at = (id: unknown) => collection.doc(String(id))
  return {
    limits: { search: 'prefix' },
    list(p: ListParams) {
      return listRows(p, { collection, spec, stored, idColumn, idField, row })
    },
    async get(id) {
      const doc = await at(id).get()
      return doc.exists ? row(doc) : null
    },
    async create(data) {
      const { [idColumn]: id, ...rest } = written(spec, data, true)
      const ref = id === undefined ? collection.doc() : at(id)
      await ref.create(rest)
      return row(await ref.get())
    },
    async update(id, patch) {
      const ref = at(id)
      const body = written(spec, patch)
      if (!(await ref.get()).exists) return null
      if (Object.keys(body).length) await ref.update(body)
      return row(await ref.get())
    },
    async remove(id) {
      const ref = at(id)
      if (!(await ref.get()).exists) return false
      await ref.delete()
      return true
    },
  }
}

/** `db.adapter@1` over a Firestore collection. */
export const adapter: DbAdapter<FirestoreCollection> = {
  name: 'firestore',
  source: (t, spec) => firestoreSource(t, spec),
}
