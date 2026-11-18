// The realtime protocol's control fields are separate from schema-checked application messages.
import type { Fn } from '../data/types'
import { admitValue, peerError, ShellDataError, tags, wireValue } from './operation'
import { fields, record, safeKey, SHELL_FRAME_BYTES } from './wire'

const text = new TextEncoder()
const invalid = () => {
  throw new ShellDataError('invalid')
}
const bounded = (value: unknown, size = 128): value is string =>
  typeof value === 'string' && value.length <= size && !/\p{Cc}/u.test(value)
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function parseRealtime(raw: string) {
  if (raw.length > SHELL_FRAME_BYTES || text.encode(raw).length > SHELL_FRAME_BYTES) invalid()
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return invalid()
  }
}

const modes = new Set(['app', 'feed', 'external', 'poll', 'off'])
function feed(value: unknown) {
  return (
    record(value) &&
    fields(value, Object.hasOwn(value, 'd') ? ['m', 'd'] : ['m']) &&
    typeof value.m === 'string' &&
    modes.has(value.m) &&
    (value.d === undefined || value.d === 1)
  )
}

export type Lookup = (id: number) => Fn | undefined

export async function admitSse(event: string, raw: string, build: string | null, find: Lookup) {
  const value = wireValue(parseRealtime(raw), build, 'sse:' + event)
  if (event === 'h' && record(value)) {
    if (
      fields(value, Object.hasOwn(value, 'l') ? ['b', 'e', 'k', 'c', 'l'] : ['b', 'e', 'k', 'c']) &&
      value.b === (build ?? '') &&
      bounded(value.e) &&
      bounded(value.k) &&
      bounded(value.c) &&
      (value.l === undefined || feed(value.l))
    )
      return value
  } else if (event === 'p') {
    if (fields(value, ['c', 't']) && bounded(value.c) && tags(value.t)) return value
  } else if (event === 'R') {
    if (fields(value, ['c']) && bounded(value.c)) return value
  } else if (event === 'L') {
    if (feed(value)) return value
  } else if (event === 'b') {
    if (fields(value, ['retry']) && index(value.retry) && value.retry <= 300_000) return value
  } else if (Array.isArray(value) && index(value[0])) {
    return admitRow(event, value, find(value[0]))
  }
  return invalid()
}

async function admitRow(event: string, row: unknown[], fn: Fn | undefined) {
  if (!fn) return undefined // A frame already in flight can arrive after dropping its subscription.
  if (event === 'e' && row.length === 2) {
    const error = peerError(row[1])
    if (error.code !== 'invalid') return [row[0], error]
  }
  if (fn.kind === 'query' && event === 'a' && row.length === 2 && tags(row[1])) return row
  if (fn.kind === 'stream') {
    if ((event === 'f' || event === 'r') && row.length === 1) return row
    if (event === 'm' && row.length === 3 && (row[1] === null || bounded(row[1])))
      return [row[0], row[1], await admitValue(fn.def.message, row[2])]
  }
  return invalid()
}

export async function admitChannel(raw: string, build: string | null, find: Lookup) {
  const row = wireValue(parseRealtime(raw), build, 'channel')
  if (!Array.isArray(row)) return invalid()
  const [kind, id, arg, name, value] = row
  if (kind === 'p' && row.length === 1) return undefined
  if (
    kind === 'h' &&
    row.length === 2 &&
    fields(id, ['k', 'e', 'b']) &&
    bounded(id.k) &&
    bounded(id.e) &&
    id.b === (build ?? '')
  )
    return row
  if (!index(id)) return invalid()
  const fn = find(id)
  if (!fn) return undefined
  if ((kind === 'j' || kind === 'r') && row.length === 3 && bounded(arg)) return row
  if (kind === 'm' && row.length === 5 && bounded(arg) && bounded(name, 64) && safeKey(name))
    return [kind, id, arg, name, await channelValue(fn, name, value)]
  if (kind === 'e' && row.length === 3) {
    const error = peerError(arg)
    if (error.code !== 'invalid') return [kind, id, error]
  }
  if (kind === 'a' && index(arg)) {
    if (row.length === 3) return row
    const error = peerError(name)
    if (row.length === 4 && error.code !== 'invalid') return [kind, id, arg, error]
  }
  return invalid()
}

async function channelValue(fn: Fn, name: string, value: unknown) {
  if (fn.kind === 'shared' && name === '$v') {
    if (!fields(value, ['v', 'at', 'o']) || !index(value.at) || !bounded(value.o)) return invalid()
    return { v: await admitValue(fn.def.value, value.v), at: value.at }
  }
  if (fn.kind !== 'channel' || !fn.def.server || !Object.hasOwn(fn.def.server, name))
    return invalid()
  return admitValue(fn.def.server[name], value)
}
