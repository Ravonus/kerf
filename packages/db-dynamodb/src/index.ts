// A list source over a DynamoDB table, through a `DynamoDBDocumentClient`. DynamoDB has no offset and sorts only inside a
// partition, so this is cursor mode only: a `Scan` by default, and a `Query` when `partition` and `sortKey` name an index.

import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { pageOf, plan, rowOf, written, type DbAdapter, type ListParams, type ListSource, type SourceSpec } from '@weft/start/list'
import { StartError } from '@weft/start/data'

export interface DynamoTarget { client: { send(command: any): Promise<any> }; table: string }

export interface DynamoSpec extends SourceSpec {
  /** With `sortKey`: list one partition through `index`, sorted. */
  partition?: { column: string; value: unknown }
  /** The public name of the index's sort key: the one thing that can be sorted on. */
  sortKey?: string
  index?: string
}

const CONDITION = 'ConditionalCheckFailedException'
const PAGE = 1 << 12

export function dynamoSource<Row = Record<string, unknown>>({ client, table }: DynamoTarget, spec: DynamoSpec): ListSource<Row> {
  const reading = rowOf(spec)
  const idField = spec.id ?? 'id', idColumn = spec.columns[idField]
  const key = (id: unknown) => ({ [idColumn]: id })
  const sortColumn = spec.sortKey && spec.columns[spec.sortKey]
  const stored = Object.values(spec.columns)
  const projection = stored.map((_, i) => `#c${i}`).join(', ')
  const names = Object.fromEntries(stored.map((c, i) => [`#c${i}`, c]))
  return {
    limits: { page: false, search: 'cased', sort: spec.sortKey ? [spec.sortKey] : [] },
    async list(p: ListParams) {
      if (p.mode === 'page') throw new StartError('Q002', 'DynamoDB has no offset', 'ask for `mode: \'cursor\'`')
      const q = plan(spec, p)
      if (q.sort && q.sort.field !== spec.sortKey) throw new StartError('Q002', `DynamoDB can sort only on the index's key, not \`${q.sort.field}\``, 'set `sortKey`')
      const values: Record<string, unknown> = {}, ExpressionAttributeNames: Record<string, string> = { ...names }
      let n = 0
      const value = (v: unknown) => { const k = `:v${n++}`; values[k] = v; return k }
      const name = (c: string) => { const k = `#n${n++}`; ExpressionAttributeNames[k] = c; return k }
      const parts = q.where.map(w => {
        const col = name(w.column)
        return `(${w.values.map(v => (v === null ? `attribute_not_exists(${col})` : `${col} = ${value(v)}`)).join(' or ')})`
      })
      if (q.search) {
        const v = value(q.search.text)
        parts.push(`(${q.search.columns.map(c => `contains(${name(c)}, ${v})`).join(' or ')})`)
      }
      const query = spec.partition && sortColumn
      const KeyConditionExpression = query ? `${name(spec.partition!.column)} = ${value(spec.partition!.value)}` : undefined
      const start = p.after ? { [idColumn]: p.after[1], ...(query ? { [spec.partition!.column]: spec.partition!.value, [sortColumn!]: p.after[0] } : {}) } : undefined
      const rows: any[] = []
      let ExclusiveStartKey: any = start
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
        const r = await client.send(query ? new QueryCommand({ ...input, IndexName: spec.index, KeyConditionExpression, ScanIndexForward: q.sort?.dir !== 'desc' }) : new ScanCommand(input))
        rows.push(...r.Items)
        ExclusiveStartKey = r.LastEvaluatedKey
      } while (ExclusiveStartKey && rows.length <= p.limit)
      return pageOf(rows.slice(0, p.limit + 1).map(reading) as Row[], p, { sort: q.sort?.field ?? spec.sortKey, id: idField })
    },
    async get(id) {
      const r = await client.send(new GetCommand({ TableName: table, Key: key(id), ConsistentRead: true }))
      return r.Item ? (reading(r.Item) as Row) : null
    },
    async create(data) {
      const Item = { ...written(spec, data, true), ...(spec.partition ? { [spec.partition.column]: spec.partition.value } : {}) }
      await client.send(new PutCommand({ TableName: table, Item }))
      return reading(Item) as Row
    },
    async update(id, patch) {
      const row = written(spec, patch)
      const keys = Object.keys(row)
      const ExpressionAttributeNames: Record<string, string> = { '#id': idColumn }, ExpressionAttributeValues: Record<string, unknown> = {}
      keys.forEach((k, i) => { ExpressionAttributeNames[`#k${i}`] = k; ExpressionAttributeValues[`:k${i}`] = row[k] })
      try {
        const r = await client.send(new UpdateCommand({ TableName: table, Key: key(id), ConditionExpression: 'attribute_exists(#id)', UpdateExpression: `set ${keys.map((_, i) => `#k${i} = :k${i}`).join(', ')}`, ExpressionAttributeNames, ExpressionAttributeValues, ReturnValues: 'ALL_NEW' }))
        return reading(r.Attributes) as Row
      } catch (e: any) {
        if (e?.name === CONDITION) return null
        throw e
      }
    },
    async remove(id) {
      return !!(await client.send(new DeleteCommand({ TableName: table, Key: key(id), ReturnValues: 'ALL_OLD' }))).Attributes
    },
  }
}

export const adapter: DbAdapter<DynamoTarget> = { name: 'dynamodb', source: (t, spec) => dynamoSource(t, spec as DynamoSpec) }
