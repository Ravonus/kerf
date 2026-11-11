import type { Body } from '../hub'
import { HANDOVER, openLine, type Line } from '../link'
import { FnError } from './api'

/** How the client reaches `/_kerf/rt`: SSE, a shared socket, or a fake under test. */
export interface Link {
  /** Resolves when the connection ends. */
  open(
    body: Body,
    frame: (event: string, data: unknown) => void,
    signal: AbortSignal,
    alive: () => void,
  ): Promise<void>
  change(body: Body): Promise<void>
}

export function transports(handover: () => void) {
  const post = (body: Body, signal?: AbortSignal) =>
    fetch('/_kerf/rt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-kerf': '1' },
      body: JSON.stringify(body),
      ...(signal && { signal }),
    })

  const http: Link = {
    async open(body, heard, signal, alive) {
      const res = await post(body, signal)
      if (!res.ok) {
        const { e } = await res.json().catch(() => ({ e: {} }))
        throw new FnError(e, res.status)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        alive()
        buf += decoder.decode(value, { stream: true })
        for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
          if (buf[0] === ':') continue
          const line = buf.indexOf('\n')
          heard(buf.slice(7, line), JSON.parse(buf.slice(line + 7, i)))
        }
      }
    },
    async change(body) {
      const res = await post(body)
      if (!res.ok) throw new FnError({}, res.status)
    },
  }

  /** A line on the browser's one socket (link.ts): the same events, and `/_kerf/rt`'s SSE is for a host with no sockets. */
  let line: Line | undefined
  const socket: Link = {
    open(body, heard, signal, alive) {
      return new Promise<void>((done, fail) => {
        const l = (line = openLine(
          'r',
          JSON.stringify(body),
          (text) => {
            alive()
            const at = text.indexOf(':'),
              event = text.slice(0, at)
            if (event !== 'ping') heard(event, JSON.parse(text.slice(at + 1)))
          },
          (code, reason) => {
            if (line === l) line = undefined
            if (code === HANDOVER) handover()
            if (code === 4000 && reason) fail(new FnError(JSON.parse(reason), 429))
            else done()
          },
        ))
        signal.addEventListener('abort', () => l.close())
      })
    },
    change(body) {
      if (!line) return Promise.reject(new FnError({}, 503))
      line.send(JSON.stringify(body))
      return Promise.resolve()
    },
  }

  return { http, socket }
}
