import type { Body } from '../hub'
import type { Link } from '../live/transport'
import { requestShell } from './client-operations'
import { shellBuild } from './client-policy'
import { readValue, ShellDataError, within } from './operation'
import { admitChannel, admitSse, type Lookup } from './realtime'
import { SHELL_BYTES, SHELL_FRAME_BYTES, SHELL_TIMEOUT } from './wire'

const encoder = new TextEncoder()

function post(body: Body, signal: AbortSignal) {
  return requestShell('/_kerf/rt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-kerf': '1' },
    body: JSON.stringify(body),
    signal,
  })
}

async function failure(response: Response, signal: AbortSignal): Promise<never> {
  await readValue(response, { kind: 'realtime', build: shellBuild(), signal })
  throw new ShellDataError('invalid')
}

async function* readEvents(response: Response, signal: AbortSignal) {
  const body = response.body
  if (
    response.redirected ||
    !body ||
    !/^text\/event-stream(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')
  ) {
    void body?.cancel().catch(() => {})
    throw new ShellDataError('invalid')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const cancel = () => void reader.cancel().catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  const buffer = new Uint8Array(SHELL_FRAME_BYTES + 32)
  let size = 0
  let newline = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      for (const byte of value) {
        if (byte === 10 && newline) {
          yield decoder.decode(buffer.subarray(0, size - 1))
          size = 0
          newline = false
          continue
        }
        if (size === buffer.length) throw new ShellDataError('invalid')
        buffer[size++] = byte
        newline = byte === 10
      }
    }
    if (size) throw new ShellDataError('invalid')
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

export function shellEvents(find: Lookup): Link {
  return {
    async open(body, heard, signal, alive) {
      let response
      try {
        response = await post(body, signal)
      } catch {
        throw new ShellDataError('unavailable')
      }
      if (response.status !== 200) return failure(response, signal)
      let ready = false
      try {
        for await (const frame of readEvents(response, signal)) {
          if (frame === ': ping') {
            if (ready) alive()
            continue
          }
          const event = /^event: ([a-zA-Z])\ndata: ([^\n]+)$/.exec(frame)
          if (!event || (event[1] === 'h') === ready) throw new ShellDataError('invalid')
          const deadline = AbortSignal.any([signal, AbortSignal.timeout(SHELL_TIMEOUT)])
          const data = await within(admitSse(event[1]!, event[2]!, shellBuild(), find), deadline)
          signal.throwIfAborted()
          ready = true
          if (data !== undefined) heard(event[1]!, data)
          alive()
        }
        if (!ready) throw new ShellDataError('invalid')
      } catch (error) {
        if (error instanceof ShellDataError) throw error
        throw new ShellDataError('invalid')
      }
    },
    async change(body) {
      const signal = AbortSignal.timeout(SHELL_TIMEOUT)
      const response = await post(body, signal)
      if (response.redirected || response.status !== 204) await failure(response, signal)
    },
  }
}

/** Select a trusted WebSocket gateway that terminates the browser's upgrade. */
export type ClientSocket = (path: string) => URL | string
let socketTarget: ClientSocket | undefined

/** Set the trusted WebSocket gateway before start. Shell channels otherwise remain unavailable. */
export function clientSocket(target: ClientSocket | undefined) {
  socketTarget = target
}

export const hasShellSocket = () => socketTarget !== undefined

export function shellSocket(callbacks: {
  find: Lookup
  frame: (value: unknown) => void
  closed: (code: number) => void
  failed: (error: ShellDataError) => void
}) {
  let socket: WebSocket
  try {
    const path = '/_kerf/ws'
    const build = shellBuild()
    if (!build || !socketTarget) throw new ShellDataError('unavailable')
    const url = new URL(socketTarget(path), location.href)
    if (url.username || url.password || url.hash) throw new ShellDataError('invalid')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(url)
  } catch {
    callbacks.failed(new ShellDataError('unavailable'))
    queueMicrotask(() => callbacks.closed(1006))
    return { send() {}, close() {} }
  }

  const lifetime = new AbortController()
  let active = true
  let ready = false
  let pending = 0
  let queued = 0
  let tail = Promise.resolve()
  const close = () => {
    active = false
    lifetime.abort()
    socket.close()
  }
  const refuse = () => {
    if (!active) return
    callbacks.failed(new ShellDataError('invalid'))
    close()
  }
  socket.onclose = ({ code }) => {
    if (active && code !== 1000 && code !== 1001)
      callbacks.failed(new ShellDataError(code === 4401 ? 'unauthorized' : 'unavailable'))
    active = false
    lifetime.abort()
    callbacks.closed(code === 4401 ? 4401 : 1006)
  }
  socket.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (!active) return
    if (typeof data !== 'string' || !data.length || data.length > SHELL_FRAME_BYTES) return refuse()
    const bytes = encoder.encode(data).length
    pending += bytes
    if (++queued > 64 || bytes > SHELL_FRAME_BYTES || pending > SHELL_BYTES) return refuse()
    tail = tail
      .then(async () => {
        if (!active) return
        const deadline = AbortSignal.any([lifetime.signal, AbortSignal.timeout(SHELL_TIMEOUT)])
        const value = await within(admitChannel(data, shellBuild(), callbacks.find), deadline)
        if (!active) return
        if (!ready && (!Array.isArray(value) || value[0] !== 'h')) return refuse()
        if (Array.isArray(value) && value[0] === 'h') {
          if (ready) return refuse()
          ready = true
        }
        if (value !== undefined) callbacks.frame(value)
      })
      .catch(refuse)
      .finally(() => {
        pending -= bytes
        queued--
      })
  }
  return {
    send: (value: string) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(value)
    },
    close,
  }
}
