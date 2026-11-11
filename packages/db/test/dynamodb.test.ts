// The `db.adapter` suite on DynamoDB Local: `KERF_TEST_DYNAMO` is its endpoint. A scan, then a query through an index.
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { LIST_ROWS, listSuite } from '@kerf/core/test/plugins'
import { decodeCursor } from '@kerf/start/list'
import { dynamoSource } from '../src/dynamodb'

const endpoint = process.env.KERF_TEST_DYNAMO
const columns = { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }

test('page mode is refused, not faked', async () => {
  await expect(
    dynamoSource(
      { client: { send: () => Promise.resolve({ Items: [] }) }, table: 't' },
      { columns },
    ).list({ mode: 'page', limit: 5, offset: 0, after: null, sort: null, filter: {} }),
  ).rejects.toThrow('Q002')
})

test('an update with nothing in it reads the row, where an empty `set` would be refused', async () => {
  const sent: object[] = []
  const client = {
    send: (c: object) => {
      sent.push(c)
      return Promise.resolve({ Item: { id: 'a', title: 'x' } })
    },
  }
  expect(await dynamoSource({ client, table: 't' }, { columns }).update('a', {})).toEqual({
    id: 'a',
    title: 'x',
  })
  expect(sent.map((c) => c.constructor.name)).toEqual(['GetCommand'])
})

// Needs DynamoDB Local running.
describe.skipIf(!endpoint)('on DynamoDB Local', () => {
  const raw = new DynamoDBClient({
    endpoint: endpoint!,
    region: 'local',
    credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  })
  const client = DynamoDBDocumentClient.from(raw)
  const table = `t${Date.now()}`
  beforeAll(() =>
    raw.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'tenant', AttributeType: 'S' },
          { AttributeName: 'rank_no', AttributeType: 'N' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'by_rank',
            KeySchema: [
              { AttributeName: 'tenant', KeyType: 'HASH' },
              { AttributeName: 'rank_no', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    ),
  )
  afterAll(() => raw.send(new DeleteTableCommand({ TableName: table })))
  const seed = async () => {
    for (const { Items } of [await client.send(new ScanCommand({ TableName: table }))])
      for (const i of Items ?? [])
        await client.send(new DeleteCommand({ TableName: table, Key: { id: i.id } }))
    for (const { id, title, status, rank, secret } of LIST_ROWS)
      await client.send(
        new PutCommand({
          TableName: table,
          Item: { id, title, status, rank_no: rank, secret, tenant: 'a' },
        }),
      )
  }

  test('a scan passes db.adapter@1', async () => {
    const checks = await listSuite({
      make: async () => (
        await seed(),
        dynamoSource({ client, table }, { columns, search: ['title'] })
      ),
      decode: decodeCursor,
    })
    expect(checks.filter((c) => !c.ok)).toEqual([])
  })

  test('a query through an index passes it, sorted', async () => {
    const spec = {
      columns,
      search: ['title'],
      partition: { column: 'tenant', value: 'a' },
      sortKey: 'rank',
      index: 'by_rank',
    }
    const checks = await listSuite({
      make: async () => (await seed(), dynamoSource({ client, table }, spec)),
      decode: decodeCursor,
    })
    expect(checks.filter((c) => !c.ok)).toEqual([])
    expect(checks.map((c) => c.name)).toContain('cursor: desc over ties sees every row once')
  })
})
