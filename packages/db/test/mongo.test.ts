// The `db.adapter` suite and the change stream on a real server: `KERF_TEST_MONGO` names a replica set.
import { MongoClient } from 'mongodb'
import { LIST_ROWS, listSuite } from '@kerf/core/test/plugins'
import { decodeCursor } from '@kerf/start/list'
import { changeTags, mongoSource, watchMongo, type MongoCollection } from '../src/mongo'

const spec = {
  columns: { id: '_id', title: 'title', status: 'status', rank: 'rank_no' },
  search: ['title'],
}
const url = process.env.KERF_TEST_MONGO
interface Row {
  _id: string
  title?: string
  status?: string
  rank_no?: number
  secret?: string
}

test('a change is tags, and only tags', () => {
  expect(changeTags({ operationType: 'update', documentKey: { _id: 'a' } }, 'tasks')).toEqual([
    'tasks',
    'tasks:a',
  ])
  expect(changeTags({ operationType: 'invalidate' }, 'tasks')).toEqual([])
})

test('a stream that fails is redialled, and pokes the whole collection', async () => {
  const pokes: string[][] = []
  let opens = 0
  const collection = {
    collectionName: 'c',
    watch: () => {
      if (++opens === 1) throw new Error('down')
      return (async function* () {
        yield { operationType: 'insert', documentKey: { _id: 1 } }
        await new Promise(() => {})
      })()
    },
  } as unknown as MongoCollection
  const stop = watchMongo(collection, { poke: (t) => void pokes.push(t), retry: 1 })
  for (let i = 0; i < 100 && pokes.length < 2; i++)
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
  expect(pokes).toEqual([['c'], ['c', 'c:1']])
  await stop()
})

// Needs a real replica set.
describe.skipIf(!url)('on a real server', () => {
  let client: MongoClient
  beforeAll(async () => {
    client = await new MongoClient(url!).connect()
  })
  afterAll(() => client.close())

  test('mongoSource passes db.adapter@1', async () => {
    const tasks = client.db('kerf_test').collection<Row>(`t${Date.now()}`)
    const make = async () => {
      await tasks.deleteMany({})
      await tasks.insertMany(
        LIST_ROWS.map(({ id, title, status, rank, secret }) => ({
          _id: id,
          title,
          status,
          rank_no: rank,
          secret,
        })),
      )
      return mongoSource(tasks, spec)
    }
    const checks = await listSuite({ make, decode: decodeCursor })
    expect(checks.filter((c) => !c.ok)).toEqual([])
    await tasks.drop()
  })

  test('a write from elsewhere reaches a poke, with no row in it', async () => {
    const tasks = client.db('kerf_test').collection<Row>(`w${Date.now()}`)
    await tasks.insertOne({ _id: 'seed' })
    const pokes: string[][] = []
    const stop = watchMongo(tasks, { tag: 'tasks', poke: (t) => void pokes.push(t) })
    await new Promise((ok) => {
      setTimeout(ok, 500)
    })
    await tasks.insertOne({ _id: 'a', title: 'top secret' })
    for (let i = 0; i < 200 && !pokes.length; i++)
      await new Promise((ok) => {
        setTimeout(ok, 25)
      })
    await stop()
    expect(pokes[0]).toEqual(['tasks', 'tasks:a'])
    await tasks.drop()
  })
})
