// A list source over a DynamoDB table, through a `DynamoDBDocumentClient`. DynamoDB has no offset and sorts only inside a
// partition, so this is cursor mode only: a `Scan` by default, and a `Query` when `partition` and `sortKey` name an index.

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
import { driver } from './driver'

const { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } =
  await driver(
    '@kerf-js/db/dynamodb',
    '@aws-sdk/lib-dynamodb',
    () => import('@aws-sdk/lib-dynamodb'),
  )

type Item = Record<string, unknown>

/** What a command answers, as far as a source reads it. */
export interface DynamoReply {
  Item?: Item | undefined
  Items?: Item[] | undefined
  Attributes?: Item | undefined
  LastEvaluatedKey?: Item | undefined
}

/** A `DynamoDBDocumentClient`, or anything else that sends these commands, and the table to send them to. */
export interface DynamoTarget {
  client: { send(command: object): Promise<DynamoReply> }
  table: string
}

/** A source's allowlist, and the index that lets a list sort. */
export interface DynamoSpec extends SourceSpec {
  /** With `sortKey`: list one partition through `index`, sorted. */
  partition?: { column: string; value: unknown }
  /** The public name of the index's sort key: the one thing that can be sorted on. */
  sortKey?: string
  index?: string
}

const CONDITION = 'ConditionalCheckFailedException'
const PAGE = 1 << 12

type DynamoList<Row> = {
  client: DynamoTarget['client']
  table: string
  spec: DynamoSpec
  idColumn: string
  sortColumn: string | undefined
  projection: string
  names: Record<string, string>
  reading: (row: object) => Row
  idField: string
}

async function listRows<Row>(p: ListParams, context: DynamoList<Row>) {
  const { client, table, spec, idColumn, sortColumn, projection, names, reading, idField } = context
  if (p.mode === 'page')
    throw new StartError('Q002', 'DynamoDB has no offset', "ask for `mode: 'cursor'`")
  const q = plan(spec, p)
  if (q.sort && q.sort.field !== spec.sortKey)
    throw new StartError(
      'Q002',
      `DynamoDB can sort only on the index's key, not \`${q.sort.field}\``,
      'set `sortKey`',
    )
  const values: Record<string, unknown> = {},
    ExpressionAttributeNames: Record<string, string> = { ...names }
  let n = 0
  const value = (v: unknown) => {
    const k = `:v${n++}`
    values[k] = v
    return k
  }
  const name = (c: string) => {
    const k = `#n${n++}`
    ExpressionAttributeNames[k] = c
    return k
  }
  const parts = q.where.map((w) => {
    const col = name(w.column)
    return `(${w.values.map((v) => (v === null ? `attribute_not_exists(${col})` : `${col} = ${value(v)}`)).join(' or ')})`
  })
  if (q.search) {
    const v = value(q.search.text)
    parts.push(`(${q.search.columns.map((c) => `contains(${name(c)}, ${v})`).join(' or ')})`)
  }
  const query = spec.partition && sortColumn
  const KeyConditionExpression = query
    ? `${name(spec.partition!.column)} = ${value(spec.partition!.value)}`
    : undefined
  const start = p.after
    ? {
        [idColumn]: p.after[1],
        ...(query
          ? { [spec.partition!.column]: spec.partition!.value, [sortColumn]: p.after[0] }
          : {}),
      }
    : undefined
  const rows: Item[] = []
  let ExclusiveStartKey: Item | undefined = start
  // `Limit` counts what's read before the filter, so a page can take several trips.
  do {
    const input = {
      TableName: table,
      ProjectionExpression: projection,
      ExpressionAttributeNames,
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
      ...(parts.length ? { FilterExpression: parts.join(' and ') } : {}),
      ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      Limit: PAGE,
    }
    const r: DynamoReply = await client.send(
      query
        ? new QueryCommand({
            ...input,
            IndexName: spec.index,
            KeyConditionExpression,
            ScanIndexForward: q.sort?.dir !== 'desc',
          })
        : new ScanCommand(input),
    )
    rows.push(...(r.Items ?? []))
    ExclusiveStartKey = r.LastEvaluatedKey
  } while (ExclusiveStartKey && rows.length <= p.limit)
  return pageOf(rows.slice(0, p.limit + 1).map(reading), p, {
    sort: q.sort?.field ?? spec.sortKey,
    id: idField,
  })
}

/** A `ListSource` over one table, in cursor mode. */
export function dynamoSource<Row = Record<string, unknown>>(
  { client, table }: DynamoTarget,
  spec: DynamoSpec,
): ListSource<Row> {
  const reading = rowOf<Row>(spec)
  const idField = spec.id ?? 'id',
    idColumn = storedId(spec)
  const key = (id: unknown) => ({ [idColumn]: id })
  const sortColumn = spec.sortKey && spec.columns[spec.sortKey]
  const stored = Object.values(spec.columns)
  const projection = stored.map((_, i) => `#c${i}`).join(', ')
  const names = Object.fromEntries(stored.map((c, i) => [`#c${i}`, c]))
  const byId = async (id: unknown) => {
    const r = await client.send(
      new GetCommand({ TableName: table, Key: key(id), ConsistentRead: true }),
    )
    return r.Item ? reading(r.Item) : null
  }
  return {
    limits: { page: false, search: 'cased', sort: spec.sortKey ? [spec.sortKey] : [] },
    list(p: ListParams) {
      return listRows(p, {
        client,
        table,
        spec,
        idColumn,
        sortColumn,
        projection,
        names,
        reading,
        idField,
      })
    },
    get: byId,
    async create(data) {
      const Item = {
        ...written(spec, data, true),
        ...(spec.partition ? { [spec.partition.column]: spec.partition.value } : {}),
      }
      await client.send(new PutCommand({ TableName: table, Item }))
      return reading(Item)
    },
    async update(id, patch) {
      const row = written(spec, patch)
      const keys = Object.keys(row)
      if (!keys.length) return byId(id)
      const ExpressionAttributeNames: Record<string, string> = { '#id': idColumn },
        ExpressionAttributeValues: Record<string, unknown> = {}
      keys.forEach((k, i) => {
        ExpressionAttributeNames[`#k${i}`] = k
        ExpressionAttributeValues[`:k${i}`] = row[k]
      })
      try {
        const r = await client.send(
          new UpdateCommand({
            TableName: table,
            Key: key(id),
            ConditionExpression: 'attribute_exists(#id)',
            UpdateExpression: `set ${keys.map((_, i) => `#k${i} = :k${i}`).join(', ')}`,
            ExpressionAttributeNames,
            ExpressionAttributeValues,
            ReturnValues: 'ALL_NEW',
          }),
        )
        return reading(r.Attributes!)
      } catch (e) {
        if ((e as { name?: string } | null)?.name === CONDITION) return null
        throw e
      }
    },
    async remove(id) {
      return !!(
        await client.send(
          new DeleteCommand({ TableName: table, Key: key(id), ReturnValues: 'ALL_OLD' }),
        )
      ).Attributes
    },
  }
}

/** `db.adapter@1` over a DynamoDB table. */
export const adapter: DbAdapter<DynamoTarget> = {
  name: 'dynamodb',
  source: (t, spec) => dynamoSource(t, spec as DynamoSpec),
}
