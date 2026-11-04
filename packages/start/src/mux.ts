// The server's half of `link.ts`: one WebSocket, many lines, each a connection of its own. A `c` line is an `attach`, a
// `r` line is a hub connection, and neither knows it isn't alone, so `id`, `exceptSelf`, `left`, buckets and session
// re-checks stay per tab. `limits.connections` counts the socket, which is what it was protecting.

import { StartError } from './data'
import type { Scope } from './exec'
import { sessionOf } from './mux-session'
import { hub, validBody, type Conn, type Hub, type Sink } from './hub'
import { attach, type Attached, type Peer } from './socket'

const LINES = 64
const HIGH = 64 * 1024

interface Physical {
  send(text: string): void
  close(code: number, reason?: string): void
  backlog(): number
}
type Open = { kind: 'c'; a: Promise<Attached> } | { kind: 'r'; c: Promise<Conn | undefined> }

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const counts = new WeakMap<Hub, Map<string, number>>()
const byUser = (h: Hub) => {
  let m = counts.get(h)
  if (!m) counts.set(h, (m = new Map()))
  return m
}

export interface Muxed {
  message(text: string): void
  close(): void
}

export async function muxed(
  peer: Physical,
  request: Request,
  scope: Scope,
  h: Hub = hub(),
): Promise<Muxed> {
  const ctx = await scope.ctx()
  const user = (ctx as { user?: { id?: string } }).user?.id
  const users = byUser(h)
  if (user !== undefined) {
    if ((users.get(user) ?? 0) >= h.limits.connections) {
      peer.close(1008, 'too many sockets')
      scope.options.onDiagnostic?.({
        code: 'R009',
        severity: 'error',
        message: `R009: user \`${user}\` already has ${h.limits.connections} sockets`,
      })
      return { message() {}, close() {} }
    }
    users.set(user, (users.get(user) ?? 0) + 1)
  }
  const lines = new Map<string, Open>()
  const bucket = { tokens: h.limits.burst * 8, at: Date.now() }
  let closed = false

  /** Every tab has the per-socket bucket; this is what stops them adding up without end. */
  const allowed = () => {
    const now = Date.now(),
      rate = h.limits.perSecond * 8
    bucket.tokens = Math.min(h.limits.burst * 8, bucket.tokens + ((now - bucket.at) * rate) / 1000)
    bucket.at = now
    return bucket.tokens-- >= 1
  }
  const end = (id: string, code: number, reason = '') => {
    if (!lines.delete(id) || closed) return
    peer.send(`x:${id}:${code}:${reason}`)
  }

  function openC(id: string) {
    const p: Peer = {
      send: (t) => {
        if (lines.has(id)) peer.send(`f:${id}:${t}`)
      },
      close: (code, reason) => end(id, code, reason),
      backlog: () => peer.backlog(),
    }
    lines.set(id, {
      kind: 'c',
      a: attach(p, request, scope, h, true).catch(() => {
        end(id, 1011)
        return { message() {}, close() {} } as unknown as Attached
      }),
    })
  }

  function openR(id: string, hello: string) {
    const body = parsed(hello)
    if (!validBody(body) || body.k)
      return peer.send(
        `x:${id}:4000:${JSON.stringify({ code: 'Q002', message: 'a realtime line opened with a body of the wrong shape' })}`,
      )
    const sink: Sink = {
      write: (event, data) => {
        if (lines.has(id)) peer.send(`r:${id}:${event}:${data}`)
      },
      ping: () => {
        if (lines.has(id)) peer.send(`r:${id}:ping:`)
      },
      backlog: () => peer.backlog(),
      close: () => end(id, 1000),
    }
    const c = h.connect(request, scope, body, sink, true).catch((e) => {
      const out =
        e instanceof StartError
          ? { code: e.code, message: e.message }
          : { message: 'Realtime failed.' }
      end(id, 4000, JSON.stringify(out))
      return undefined
    })
    lines.set(id, { kind: 'r', c })
  }

  function shut(id: string, line: Open) {
    lines.delete(id)
    if (line.kind === 'c') void line.a.then((a) => a.close())
    else void line.c.then((c) => c && h.close(c))
  }

  const drain = setInterval(() => {
    if (peer.backlog() >= HIGH) return
    for (const l of lines.values()) if (l.kind === 'r') void l.c.then((c) => c && h.drain(c))
  }, 100)
  ;(drain as { unref?(): void }).unref?.()

  peer.send(`h:${await sessionOf(ctx)}`)
  return {
    message(text) {
      if (text === 'p') return peer.send('p')
      if (text.length > h.limits.body + 64) return peer.close(1009, 'too big')
      if (!allowed()) {
        scope.options.onDiagnostic?.({
          code: 'R008',
          severity: 'error',
          message: `R008: one browser sent over ${h.limits.perSecond * 8} messages a second`,
        })
        return peer.close(1008, 'rate limit')
      }
      const at = text.indexOf(':', 2)
      const id = text.slice(2, at),
        rest = text.slice(at + 1)
      const line = lines.get(id)
      if (text[0] === 'f') {
        if (line?.kind === 'c') void line.a.then((a) => a.message(rest))
        else if (line) {
          let body: Body | undefined
          try {
            body = JSON.parse(rest)
          } catch {}
          if (validBody(body))
            void line.c
              .then((c) => c && h.change(c, request, scope.options, body))
              .catch(() => end(id, 1011))
        }
      } else if (text[0] === 'x') {
        if (line) shut(id, line)
      } else if (text[0] === 'o') {
        if (line) return
        if (lines.size >= LINES) return peer.send(`x:${id}:1008:too many lines`)
        if (rest[0] === 'c') openC(id)
        else if (rest[0] === 'r') openR(id, rest.slice(2))
      }
    },
    close() {
      if (closed) return
      closed = true
      clearInterval(drain)
      for (const [id, line] of Array.from(lines)) shut(id, line)
      if (user !== undefined) {
        const n = (users.get(user) ?? 1) - 1
        if (n) users.set(user, n)
        else users.delete(user)
      }
    },
  }
}
