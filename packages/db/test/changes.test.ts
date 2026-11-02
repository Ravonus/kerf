// The change feed on a real MongoDB: `WEFT_TEST_MONGO` a replica set, `WEFT_TEST_MONGO_SOLO` a standalone. Their
// databases are yours to lose.
import { createFeed } from '@weft-js/start/changes'
import { mongoChanges } from '../src/mongo'

const url = process.env.WEFT_TEST_MONGO
const solo = process.env.WEFT_TEST_MONGO_SOLO
const wait = (ms = 0) => new Promise(ok => setTimeout(ok, ms))
async function until(ok: () => boolean, ms = 6000) {
  const end = Date.now() + ms
  while (!ok() && Date.now() < end) await wait(5)
  expect(ok()).toBe(true)
}

describe.skipIf(!url)('mongo change feed', () => {
  let client: any, db: any
  beforeAll(async () => {
    const { MongoClient } = await import('mongodb')
    client = new MongoClient(url!, { directConnection: true })
    await client.connect()
    db = client.db('live_test')
    await db.dropDatabase()
  })
  afterAll(async () => client?.close())
  const on = () => {
    const pokes: any[] = []
    const s = mongoChanges(db, ['todos'])
    return { pokes, s, feed: createFeed(s, { emit: p => pokes.push(p), status() {} }, {}) }
  }

  test('a write is a poke of collection and id, with no field; other collections are silent', async () => {
    const f = on()
    const how = await f.s.probe()
    expect(how).toEqual({ mode: 'feed', via: 'mongo-change-stream' })
    await f.feed.start(how)
    await wait(300)
    await db.collection('other').insertOne({ secret: 'x' })
    await db.collection('todos').insertOne({ _id: 'a', secret: 'hunter2' } as any)
    await until(() => f.pokes.length > 0)
    expect(f.pokes).toEqual([{ t: ['todos', 'todos:a'] }])
    await f.feed.stop()
  })

  test('a barrier in the oplog covers the write before it', async () => {
    const f = on()
    await f.feed.start(await f.s.probe())
    await wait(300)
    await db.collection('todos').updateOne({ _id: 'a' }, { $set: { secret: 'z' } })
    await f.feed.settle(['todos', 'todos:a'])
    await wait(250)
    expect(f.pokes).toEqual([])
    await f.feed.stop()
  })
})

describe.skipIf(!solo)('mongo without a replica set', () => {
  test('off, and how to fix it', async () => {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(solo!, { directConnection: true })
    await client.connect()
    const how = await mongoChanges(client.db('x') as any, ['todos']).probe()
    expect(how.mode).toBe('off')
    expect(how.fix).toMatch(/replSet/)
    await client.close()
  })
})
