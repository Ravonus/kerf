// A list source over a MongoDB collection, and writes from anywhere as tag pokes. Every filter is `$eq`/`$in` on a
// checked scalar and a search is an escaped `$regex`, so a request has no way to name an operator. Takes
// whatever has the driver's collection methods, so `mongodb` is the app's dependency.

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
} from '@weft-js/start/list'
import { hub } from '@weft-js/start/hub'
import type { Source } from '@weft-js/start/changes'

/** What a change stream hands over, as far as anything here reads it. */
export interface MongoEvent extends MongoChange {
  ns?: { coll?: string }
  fullDocument?: { tags?: string[] }
}

/** The driver's change stream. */
export type MongoStream = AsyncIterable<MongoEvent> & { close?(): Promise<unknown> }

/** The methods of the driver's `Collection` a source calls. */
export interface MongoCollection {
  collectionName?: string
  find(filter: object, options?: object): { toArray(): Promise<object[]> }
  countDocuments(filter: object): Promise<number>
  findOne(filter: object, options?: object): Promise<object | null>
  insertOne(doc: object): Promise<unknown>
  findOneAndUpdate(filter: object, update: object, options: object): Promise<object | null>
  deleteOne(filter: object): Promise<{ deletedCount?: number }>
  watch(pipeline?: object[], options?: object): MongoStream
}

const regex = (text: string) => ({
  $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  $options: 'i',
})

/** A `ListSource` over one collection. */
export function mongoSource<Row = Record<string, unknown>>(
  collection: MongoCollection,
  spec: SourceSpec,
): ListSource<Row> {
  const stored = Object.values(spec.columns)
  const idColumn = storedId(spec)
  const projection = Object.fromEntries([
    ...stored.map((c) => [c, 1]),
    ...(stored.includes('_id') ? [] : [['_id', 0]]),
  ])
  const reading = rowOf<Row>(spec)
  return {
    async list(p: ListParams) {
      const q = plan(spec, p)
      const and: object[] = q.where.map((w) => ({
        [w.column]: w.values.length === 1 ? { $eq: w.values[0] } : { $in: w.values },
      }))
      if (q.search) and.push({ $or: q.search.columns.map((c) => ({ [c]: regex(q.search!.text) })) })
      const filter = and.length ? { $and: and } : {}
      const dir = q.sort?.dir === 'desc' ? -1 : 1,
        cmp = dir < 0 ? '$lt' : '$gt'
      const keyset =
        p.after &&
        (q.sort
          ? {
              $or: [
                { [q.sort.column]: { [cmp]: p.after[0] } },
                { [q.sort.column]: { $eq: p.after[0] }, [idColumn]: { [cmp]: p.after[1] } },
              ],
            }
          : { [idColumn]: { $gt: p.after[1] } })
      const sort = q.sort ? { [q.sort.column]: dir, [idColumn]: dir } : { [idColumn]: 1 }
      const cursor = p.mode === 'cursor'
      const rows = (
        await collection
          .find(keyset ? { $and: [...and, keyset] } : filter, {
            projection,
            sort,
            skip: p.offset,
            limit: cursor ? p.limit + 1 : p.limit,
          })
          .toArray()
      ).map(reading)
      return pageOf(
        rows,
        p,
        { sort: q.sort?.field, id: q.id.field },
        cursor ? undefined : await collection.countDocuments(filter),
      )
    },
    get: async (id) => {
      const r = await collection.findOne({ [idColumn]: { $eq: id } }, { projection })
      return r ? reading(r) : null
    },
    async create(data) {
      const doc = written(spec, data, true)
      await collection.insertOne({ ...doc })
      return reading(doc)
    },
    async update(id, patch) {
      const r = await collection.findOneAndUpdate(
        { [idColumn]: { $eq: id } },
        { $set: written(spec, patch) },
        { projection, returnDocument: 'after' },
      )
      return r ? reading(r) : null
    },
    remove: async (id) =>
      ((await collection.deleteOne({ [idColumn]: { $eq: id } })).deletedCount ?? 0) > 0,
  }
}

/** `db.adapter@1` over a Mongo collection. */
export const adapter: DbAdapter<MongoCollection> = {
  name: 'mongo',
  source: (t, spec) => mongoSource(t, spec),
}

/** The methods of the driver's `Db` the change feed calls. */
export interface MongoDb {
  command(doc: object): Promise<{ setName?: string; msg?: string }>
  watch(pipeline?: object[], options?: object): MongoStream
  collection(name: string): { insertOne(doc: object): Promise<unknown> }
  createCollection?(name: string, options?: object): Promise<unknown>
}

const BARRIER = '__weft_barrier'
const said = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e)

/**
 * `realtime({ changes: mongoChanges(db, ['todos']) })`: one change stream, ids only, read by every instance. A mutation's
 * barrier is a capped collection's insert, so the oplog puts it after the writes it covers. After a lost stream every
 * collection is poked: the resume token is not kept, because a poke is cheaper than a stale page.
 */
export function mongoChanges(
  db: MongoDb,
  collections: string[],
  options: { retry?: number; external?: boolean } = {},
): Source {
  const retry = options.retry ?? 1000
  return {
    name: 'mongodb',
    tables: collections,
    hold: 120, // a stream hands over a batch at a time
    external: options.external,
    async probe() {
      try {
        const hello = await db.command({ hello: 1 })
        if (hello.setName || hello.msg === 'isdbgrid')
          return { mode: 'feed', via: 'mongo-change-stream' }
        return {
          mode: 'off',
          via: 'none',
          why: 'a standalone mongod has no oplog, so no change streams',
          fix: 'run it as a replica set: a single member is enough (`mongod --replSet rs0`, then `rs.initiate()`)',
        }
      } catch (e) {
        return {
          mode: 'off',
          via: 'none',
          why: `MongoDB didn't answer: ${said(e)}`,
          fix: 'check the connection string',
        }
      }
    },
    async start(sink, how) {
      if (how.mode === 'off') return () => {}
      await db.createCollection?.(BARRIER, { capped: true, size: 1 << 20 }).catch(() => {})
      let stream: MongoStream | undefined,
        stopped = false,
        timer: ReturnType<typeof setTimeout> | undefined,
        again = false
      const pipeline = [
        { $match: { 'ns.coll': { $in: [...collections, BARRIER] } } },
        { $project: { operationType: 1, documentKey: 1, 'ns.coll': 1, 'fullDocument.tags': 1 } },
      ]
      const run = async () => {
        if (stopped) return
        try {
          stream = db.watch(pipeline)
          if (again) sink.lost()
          sink.up()
          again = true
          for await (const c of stream) {
            if (c.ns?.coll === BARRIER) {
              if (c.fullDocument?.tags) sink.settled(c.fullDocument.tags)
              continue
            }
            if (!['insert', 'update', 'replace', 'delete'].includes(c.operationType) || !c.ns?.coll)
              continue
            sink.changes([
              {
                table: c.ns.coll,
                ...(c.documentKey?._id !== undefined && { id: String(c.documentKey._id) }),
              },
            ])
          }
        } catch (e) {
          if (!stopped) sink.down(`change stream: ${said(e)}`)
        }
        if (!stopped) timer = setTimeout(() => void run(), retry)
      }
      void run()
      return async () => {
        stopped = true
        clearTimeout(timer)
        await stream?.close?.()
      }
    },
    settle: async (tags) => void (await db.collection(BARRIER).insertOne({ tags })),
  }
}

/** The fields of a change-stream event that say what happened to which row. */
export interface MongoChange {
  operationType: string
  documentKey?: { _id?: string | number | { toString(): string } }
}

/** The tags of one change: the collection's, and the row's. Never the row itself. */
export function changeTags(change: MongoChange, tag: string): string[] {
  if (!['insert', 'update', 'replace', 'delete'].includes(change.operationType)) return []
  const id = change.documentKey?._id
  return id === undefined ? [tag] : [tag, `${tag}:${String(id)}`]
}

/** How `watchMongo` turns a stream into pokes. */
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
export function watchMongo(
  collection: MongoCollection,
  options: WatchOptions = {},
): () => Promise<void> {
  const tag = options.tag ?? collection.collectionName
  if (!tag) throw new Error('`watchMongo` needs a `tag`')
  const poke = options.poke ?? ((tags: string[]) => hub().poke(tags))
  const retry = options.retry ?? 1000
  let stream: MongoStream | undefined,
    stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined
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
