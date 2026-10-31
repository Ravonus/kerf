// A list source over a MongoDB collection, and writes from anywhere as tag pokes. Every filter is `$eq`/`$in` on a
// checked scalar and a search is an escaped `$regex`, so a request has no way to name an operator (agorix H6). Takes
// whatever has the driver's collection methods, so `mongodb` is the app's dependency.

import { pageOf, plan, rowOf, written, type DbAdapter, type ListParams, type ListSource, type SourceSpec } from '@weft/start/list'
import { hub } from '@weft/start/hub'

export interface MongoCollection {
  collectionName?: string
  find(filter: any, options?: any): { toArray(): Promise<any[]> }
  countDocuments(filter: any): Promise<number>
  findOne(filter: any, options?: any): Promise<any>
  insertOne(doc: any): Promise<unknown>
  findOneAndUpdate(filter: any, update: any, options?: any): Promise<any>
  deleteOne(filter: any): Promise<{ deletedCount?: number }>
  watch(pipeline?: any[], options?: any): AsyncIterable<any> & { close?(): Promise<unknown> }
}

const regex = (text: string) => ({ $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' })

export function mongoSource<Row = Record<string, unknown>>(collection: MongoCollection, spec: SourceSpec): ListSource<Row> {
  const stored = Object.values(spec.columns)
  const idColumn = spec.columns[spec.id ?? 'id']
  const projection = Object.fromEntries([...stored.map(c => [c, 1]), ...(stored.includes('_id') ? [] : [['_id', 0]])])
  const reading = rowOf(spec)
  return {
    async list(p: ListParams) {
      const q = plan(spec, p)
      const and: any[] = q.where.map(w => ({ [w.column]: w.values.length === 1 ? { $eq: w.values[0] } : { $in: w.values } }))
      if (q.search) and.push({ $or: q.search.columns.map(c => ({ [c]: regex(q.search!.text) })) })
      const filter = and.length ? { $and: and } : {}
      const dir = q.sort?.dir === 'desc' ? -1 : 1, cmp = dir < 0 ? '$lt' : '$gt'
      const keyset = p.after && (q.sort
        ? { $or: [{ [q.sort.column]: { [cmp]: p.after[0] } }, { [q.sort.column]: { $eq: p.after[0] }, [idColumn]: { [cmp]: p.after[1] } }] }
        : { [idColumn]: { $gt: p.after[1] } })
      const sort = q.sort ? { [q.sort.column]: dir, [idColumn]: dir } : { [idColumn]: 1 }
      const cursor = p.mode === 'cursor'
      const rows = (await collection.find(keyset ? { $and: [...and, keyset] } : filter, { projection, sort, skip: p.offset, limit: cursor ? p.limit + 1 : p.limit }).toArray()).map(reading) as Row[]
      return pageOf(rows, p, { sort: q.sort?.field, id: q.id.field }, cursor ? undefined : await collection.countDocuments(filter))
    },
    get: async id => { const r = await collection.findOne({ [idColumn]: { $eq: id } }, { projection }); return r ? (reading(r) as Row) : null },
    async create(data) {
      const doc = written(spec, data, true)
      await collection.insertOne({ ...doc })
      return reading(doc) as Row
    },
    async update(id, patch) {
      const r = await collection.findOneAndUpdate({ [idColumn]: { $eq: id } }, { $set: written(spec, patch) }, { projection, returnDocument: 'after' })
      return r ? (reading(r) as Row) : null
    },
    remove: async id => ((await collection.deleteOne({ [idColumn]: { $eq: id } })).deletedCount ?? 0) > 0,
  }
}

export const adapter: DbAdapter<MongoCollection> = { name: 'mongo', source: (t, spec) => mongoSource(t, spec) }

export interface MongoChange { operationType: string; documentKey?: { _id?: unknown } }

/** The tags of one change: the collection's, and the row's. Never the row itself. */
export function changeTags(change: MongoChange, tag: string): string[] {
  if (!['insert', 'update', 'replace', 'delete'].includes(change.operationType)) return []
  const id = change.documentKey?._id
  return id === undefined ? [tag] : [tag, `${tag}:${id}`]
}

export interface WatchOptions {
  /** Default the collection's name. */
  tag?: string
  /** Where the tags go. Default the realtime hub, as `invalidate` would. */
  poke?: (tags: string[]) => unknown
  /** Ms between attempts after the stream fails. Default 1000. */
  retry?: number
}

/**
 * Writes from cron, a shell or another service reach `.live` queries, as tags. Needs a replica set. After a lost stream
 * the whole collection's tag is poked, because what happened meanwhile is unknown. Returns the way to stop.
 */
export function watchMongo(collection: MongoCollection, options: WatchOptions = {}): () => Promise<void> {
  const tag = options.tag ?? collection.collectionName
  if (!tag) throw new Error('`watchMongo` needs a `tag`')
  const poke = options.poke ?? ((tags: string[]) => hub().poke(tags))
  const retry = options.retry ?? 1000
  let stream: ReturnType<MongoCollection['watch']> | undefined, stopped = false, timer: ReturnType<typeof setTimeout> | undefined
  const run = async (again: boolean) => {
    if (stopped) return
    try {
      stream = collection.watch([{ $project: { operationType: 1, documentKey: 1 } }])
      if (again) await poke([tag])
      for await (const change of stream) {
        const tags = changeTags(change, tag)
        if (tags.length) await poke(tags)
      }
    } catch {
      // A closed stream ends here too; the loop below decides.
    }
    if (!stopped) timer = setTimeout(() => void run(true), retry)
  }
  void run(false)
  return async () => {
    stopped = true
    clearTimeout(timer)
    await stream?.close?.()
  }
}
