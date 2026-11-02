// A list source over a Firestore collection (the Admin SDK's `CollectionReference`, or anything shaped like it). The
// document id is the row's id. Firestore can't search inside a string, and a range is one field at a time, so `search`
// is a prefix on the first search column, and can't be combined with another sort.

import { pageOf, plan, rowOf, written, type DbAdapter, type ListParams, type ListSource, type SourceSpec } from '@weft/start/list'
import { StartError } from '@weft/start/data'

const NAME = '__name__', HIGH = '', IN_MAX = 30

export function firestoreSource<Row = Record<string, unknown>>(collection: any, spec: SourceSpec): ListSource<Row> {
  const reading = rowOf(spec)
  const idField = spec.id ?? 'id', idColumn = spec.columns[idField]
  const stored = Object.values(spec.columns).filter(c => c !== idColumn)
  const row = (doc: any) => reading({ [idColumn]: doc.id, ...doc.data() }) as Row
  return {
    limits: { search: 'prefix' },
    async list(p: ListParams) {
      const q = plan(spec, p)
      let b = collection.select(...stored)
      for (const w of q.where) {
        if (w.values.length > IN_MAX) throw new StartError('Q002', `Firestore takes ${IN_MAX} values in a filter`, 'ask for fewer')
        b = w.values.length === 1 ? b.where(w.column, '==', w.values[0]) : b.where(w.column, 'in', w.values)
      }
      let first = q.sort?.column === idColumn ? null : q.sort?.column ?? null
      const dir = q.sort?.dir ?? 'asc'
      if (q.search) {
        const field = q.search.columns[0]
        if (first && first !== field) throw new StartError('Q002', 'Firestore can\'t search one field and sort by another', 'drop one')
        first = field
        b = b.where(field, '>=', q.search.text).where(field, '<=', q.search.text + HIGH)
      }
      const counted = b
      if (first) b = b.orderBy(first, dir)
      b = b.orderBy(NAME, dir)
      if (p.after) b = first ? b.startAfter(p.after[0], p.after[1]) : b.startAfter(p.after[1])
      const cursor = p.mode === 'cursor'
      if (p.offset) b = b.offset(p.offset)
      const rows = (await b.limit(cursor ? p.limit + 1 : p.limit).get()).docs.map(row)
      const total = cursor ? undefined : (await counted.count().get()).data().count
      return pageOf(rows, p, { sort: q.sort?.field ?? (first ? Object.keys(spec.columns).find(k => spec.columns[k] === first) : undefined), id: idField }, total)
    },
    async get(id) {
      const doc = await collection.doc(String(id)).get()
      return doc.exists ? row(doc) : null
    },
    async create(data) {
      const { [idColumn]: id, ...rest } = written(spec, data, true)
      const ref = id === undefined ? collection.doc() : collection.doc(String(id))
      await ref.create(rest)
      return row(await ref.get())
    },
    async update(id, patch) {
      const ref = collection.doc(String(id))
      const body = written(spec, patch)
      if (!(await ref.get()).exists) return null
      await ref.update(body)
      return row(await ref.get())
    },
    async remove(id) {
      const ref = collection.doc(String(id))
      if (!(await ref.get()).exists) return false
      await ref.delete()
      return true
    },
  }
}

export const adapter: DbAdapter = { name: 'firestore', source: (t, spec) => firestoreSource(t, spec) }
