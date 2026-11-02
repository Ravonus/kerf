// The `db.adapter` suite and the change stream on a real server: `WEFT_TEST_MONGO` names a replica set.
import { MongoClient } from 'mongodb'
import { LIST_ROWS, listSuite } from '@weft-js/core/test/plugins'
import { decodeCursor } from '@weft-js/start/list'
import { changeTags, mongoSource, watchMongo } from '../src/mongo'

const spec = { columns: { id: '_id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] }
const url = process.env.WEFT_TEST_MONGO

test('a change is tags, and only tags', () => {
  expect(changeTags({ operationType: 'update', documentKey: { _id: 'a' } }, 'tasks')).toEqual(['tasks', 'tasks:a'])
  expect(changeTags({ operationType: 'invalidate' }, 'tasks')).toEqual([])
})

test('a stream that fails is redialled, and pokes the whole collection', async () => {
  const pokes: string[][] = []
  let opens = 0
  const collection: any = { collectionName: 'c', watch: () => { if (++opens === 1) throw new Error('down'); return (async function* () { yield { operationType: 'insert', documentKey: { _id: 1 } }; await new Promise(() => {}) })() } }
  const stop = watchMongo(collection, { poke: t => void pokes.push(t), retry: 1 })
  for (let i = 0; i < 100 && pokes.length < 2; i++) await new Promise(ok => setTimeout(ok, 5))
  expect(pokes).toEqual([['c'], ['c', 'c:1']])
  await stop()
})

describe.skipIf(!url)('on a real server', () => {
  let client: MongoClient
  beforeAll(async () => { client = await new MongoClient(url!).connect() })
  afterAll(() => client.close())

  test('mongoSource passes db.adapter@1', async () => {
    const tasks = client.db('weft_test').collection<any>(`t${Date.now()}`)
    const make = async () => {
      await tasks.deleteMany({})
      await tasks.insertMany(LIST_ROWS.map(({ id, title, status, rank, secret }) => ({ _id: id, title, status, rank_no: rank, secret })))
      return mongoSource(tasks as any, spec)
    }
    const checks = await listSuite({ make, decode: decodeCursor })
    expect(checks.filter(c => !c.ok)).toEqual([])
    await tasks.drop()
  })

  test('a write from elsewhere reaches a poke, with no row in it', async () => {
    const tasks = client.db('weft_test').collection<any>(`w${Date.now()}`)
    await tasks.insertOne({ _id: 'seed' as any })
    const pokes: string[][] = []
    const stop = watchMongo(tasks as any, { tag: 'tasks', poke: t => void pokes.push(t) })
    await new Promise(ok => setTimeout(ok, 500))
    await tasks.insertOne({ _id: 'a' as any, title: 'top secret' })
    for (let i = 0; i < 200 && !pokes.length; i++) await new Promise(ok => setTimeout(ok, 25))
    await stop()
    expect(pokes[0]).toEqual(['tasks', 'tasks:a'])
    await tasks.drop()
  })
})
