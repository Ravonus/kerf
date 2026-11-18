// Realtime carries only closed failure codes, even when the peer runs in dev.
import { peerStatus, wireFrame } from './operation'
import { record, SHELL_FRAME_BYTES } from './wire'

const text = new TextEncoder()
const code = (fault: unknown) => peerStatus(record(fault) ? fault.status : undefined)

export function realtimeFrame(build: string | null, kind: string, value: unknown) {
  const raw = JSON.stringify(wireFrame(build, kind, value))
  return text.encode(raw).length <= SHELL_FRAME_BYTES ? raw : undefined
}

export function sseFrame(build: string | null, event: string, data: string) {
  const value: unknown = JSON.parse(data)
  if (event === 'e' && Array.isArray(value))
    return realtimeFrame(build, 'sse:e', [value[0], code(value[1])])
  return realtimeFrame(build, 'sse:' + event, value)
}

export function socketFrame(build: string | null, raw: string) {
  const row = JSON.parse(raw) as unknown[]
  if (row[0] === 'e') row[2] = code(row[2])
  if (row[0] === 'a' && row.length === 4) row[3] = code(row[3])
  return realtimeFrame(build, 'channel', row)
}
