import type { Conn, Limits } from '../hub'

type Sub = Conn['subs'] extends Map<number, infer S> ? S : never

const HIGH = 64 * 1024

export function createDelivery(
  limits: Limits,
  cursorOf: (n: number) => string,
  bye: (c: Conn, retry: number) => void,
) {
  function poke(c: Conn, tags: string[], at: number) {
    if (!tags.length) return
    if (!c.held.size && c.sink.backlog() < HIGH)
      return c.sink.write('p', JSON.stringify({ t: tags, c: cursorOf(at) }))
    const p = (c.pokes ??= { t: new Set(), c: '' })
    for (const t of tags) p.t.add(t)
    p.c = cursorOf(at)
  }

  /** Over `queue`: the client gets a bye, reconnects and resumes, rather than this process growing. */
  function hold(c: Conn, s: Sub, raw: string): boolean {
    const size = raw.length
    if (!s.buffer) {
      for (const x of s.q) c.bytes -= x.size
      s.q.length = 0
    } else if (s.q.length >= s.buffer) {
      for (const x of s.q) c.bytes -= x.size
      s.q.length = 0
      return false
    }
    s.q.push({ raw, size })
    c.bytes += size
    c.held.add(s)
    if (c.bytes > limits.queue) bye(c, 0)
    return true
  }

  /** Written to the client, or held. False: the buffer overflowed, so this stream resets. */
  function deliver(c: Conn, s: Sub, raw: string): boolean {
    if (!c.held.size && c.sink.backlog() < HIGH) return (c.sink.write('m', raw), true)
    return hold(c, s, raw)
  }

  function drain(c: Conn) {
    if (c.pokes && c.sink.backlog() < HIGH) {
      c.sink.write('p', JSON.stringify({ t: [...c.pokes.t], c: c.pokes.c }))
      c.pokes = undefined
    }
    for (const s of c.held) {
      while (s.q.length && c.sink.backlog() < HIGH) {
        const x = s.q.shift()!
        c.bytes -= x.size
        c.sink.write('m', x.raw)
      }
      if (s.q.length) return
      c.held.delete(s)
    }
  }

  return { poke, deliver, drain }
}
