// The change feed on a real MongoDB: `KERF_TEST_MONGO` a replica set, `KERF_TEST_MONGO_SOLO` a standalone. Their
// databases are yours to lose.
import { until6000 as until } from '../../start/test/change-wait.helpers.mjs'
import { sleep as wait } from '../../../scripts/lib/helpers.mjs'
import { createFeed } from '@kerf/start/changes'
import type { Db, MongoClient, ObjectId } from 'mongodb'
import { mongoChanges } from '../src/mongo'

const url = process.env.KERF_TEST_MONGO
const solo = process.env.KERF_TEST_MONGO_SOLO

// A change stream needs a real replica set, which only a machine with one configures.
describe.skipIf(!url)('mongo change feed', () => {
  let client: MongoClient, db: Db
  beforeAll(async () => {
    const { MongoClient } = await import('mongodb')
    client = new MongoClient(url!, { directConnection: true })
    await client.connect()
    db = client.db('live_test')
    await db.dropDatabase()
  })
  afterAll(() => client?.close())
  const on = () => {
    const pokes: unknown[] = []
    const s = mongoChanges(db, ['todos'])
    return { pokes, s, feed: createFeed(s, { emit: (p) => pokes.push(p), status() {} }, {}) }
  }

  test('a write is a poke of collection and id, with no field; other collections are silent', async () => {
    const f = on()
    const how = await f.s.probe()
    expect(how).toEqual({ mode: 'feed', via: 'mongo-change-stream' })
    await f.feed.start(how)
    await wait(300)
    await db.collection('other').insertOne({ secret: 'x' })
    await db.collection('todos').insertOne({ _id: 'a' as unknown as ObjectId, secret: 'hunter2' })
    await until(() => f.pokes.length > 0)
    expect(f.pokes).toEqual([{ t: ['todos', 'todos:a'] }])
    await f.feed.stop()
  })

  test('a barrier in the oplog covers the write before it', async () => {
    const f = on()
    await f.feed.start(await f.s.probe())
    await wait(300)
    await db
      .collection('todos')
      .updateOne({ _id: 'a' as unknown as ObjectId }, { $set: { secret: 'z' } })
    await f.feed.settle(['todos', 'todos:a'])
    await wait(250)
    expect(f.pokes).toEqual([])
    await f.feed.stop()
  })
})

// Needs a real standalone mongod.
describe.skipIf(!solo)('mongo without a replica set', () => {
  test('off, and how to fix it', async () => {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(solo!, { directConnection: true })
    await client.connect()
    const how = await mongoChanges(client.db('x'), ['todos']).probe()
    expect(how.mode).toBe('off')
    expect(how.fix).toMatch(/replSet/)
    await client.close()
  })
})
