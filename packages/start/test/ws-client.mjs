// A small protocol client for /_weft/ws: tests and the runtime matrix use it. Node's global WebSocket can't set `Origin`,
// so this one is `ws`-free: it's the platform's, with the header passed where the platform allows it.
import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'

export const fnId = (name, file = 'src/server/chat.ts') =>
  `${name}.${createHash('sha256').update(file).digest('hex').slice(0, 6)}`

/** The handshake's status: what a refused upgrade answers, with any `Origin`. */
export function handshake(url, headers = {}) {
  const u = new URL(url)
  return new Promise((ok, no) => {
    const req = httpRequest({
      host: u.hostname,
      port: u.port,
      path: '/_weft/ws',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    })
    req.on('upgrade', (_res, socket) => {
      socket.destroy()
      ok(101)
    })
    req.on('response', (res) => {
      res.resume()
      ok(res.statusCode)
    })
    req.on('error', no)
    req.setTimeout(5000, () => req.destroy(new Error('handshake timed out')))
    req.end()
  })
}

/** An open socket, from the app's own origin. `headers`: a session cookie. */
export async function open(url, headers = {}) {
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/_weft/ws', {
    headers: { origin: new URL(url).origin, ...headers },
  })
  const frames = []
  const waiting = new Set()
  let closed
  ws.addEventListener('message', (e) => {
    frames.push(JSON.parse(e.data))
    for (const w of waiting) w()
  })
  ws.addEventListener('close', (e) => {
    closed = e.code
    for (const w of waiting) w()
  })
  await new Promise((ok, no) => {
    ws.addEventListener('open', ok)
    ws.addEventListener('error', () => no(new Error('the socket did not open')))
    setTimeout(() => no(new Error('the socket did not open in 5 s')), 5000)
  })
  return {
    frames,
    send: (...f) => ws.send(JSON.stringify(f)),
    raw: (t) => ws.send(t),
    close: () => ws.close(),
    get closed() {
      return closed
    },
    /** The next unread frame the test matches. */
    async until(match, timeout = 5000) {
      const test = typeof match === 'function' ? match : (f) => f[0] === match
      const end = Date.now() + timeout
      for (;;) {
        const i = frames.findIndex(test)
        if (i >= 0) return frames.splice(i, 1)[0]
        const left = end - Date.now()
        if (left <= 0) throw new Error(`no frame in ${timeout} ms: ${JSON.stringify(frames)}`)
        await new Promise((ok) => {
          const t = setTimeout(ok, left)
          const w = () => {
            clearTimeout(t)
            waiting.delete(w)
            ok()
          }
          waiting.add(w)
        })
      }
    },
    async shut(timeout = 5000) {
      const end = Date.now() + timeout
      // oxlint-disable-next-line no-unmodified-loop-condition -- the socket's close handler sets it during the await
      while (closed === undefined && Date.now() < end)
        await new Promise((ok) => {
          setTimeout(ok, 20)
        })
      return closed
    },
  }
}
