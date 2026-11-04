// One TCP proxy in front of Postgres, delaying each direction by RTT/2, so a query costs a real round trip and N+1 costs N.
// It runs as its own process (spawnProxy): timers in the bench's event loop would measure the bench. Sockets, not a sleep: the
// pool, the wire format and the drivers' own round trips all stay in. It also reads the frontend protocol, for a query count
// that needs nothing from the server, and counts turns (client speaks after the server did), connections and bytes.
import { fork } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const now = () => performance.now()
const empty = () => ({ queries: 0, roundTrips: 0, bytesUp: 0, bytesDown: 0, connections: 0 })
const NOT_STARTUP = new Set([80877103, 80877104, 80877102]) // SSLRequest, GSSENCRequest, CancelRequest: still before the startup message

/** Counts Query and Execute messages. The startup messages are the only ones with no type byte. */
function frontend(onQuery) {
  let held = Buffer.alloc(0),
    started = false
  return (chunk) => {
    held = held.length ? Buffer.concat([held, chunk]) : chunk
    for (;;) {
      if (!started) {
        if (held.length < 8) return
        const len = held.readInt32BE(0)
        if (held.length < len) return
        started = !NOT_STARTUP.has(held.readInt32BE(4))
        held = held.subarray(len)
      } else {
        if (held.length < 5) return
        const len = held.readInt32BE(1) + 1
        if (held.length < len) return
        if (held[0] === 0x51 || held[0] === 0x45) onQuery()
        held = held.subarray(len)
      }
    }
  }
}

// How long before the due time a timer is safe. Windows' timers fire on a 15.6 ms tick, so one there can overshoot by that much.
const EARLY = process.platform === 'win32' ? 17 : 1.2

/** A queue per direction, in order: a timer to just short of the due time, then the event loop, because setTimeout alone overshoots a 1 ms delay. */
function delayed(to, ms) {
  const q = []
  let armed = false
  const flush = () => {
    armed = false
    while (q.length && q[0].at <= now()) {
      const { chunk } = q.shift()
      chunk ? to.write(chunk) : to.end()
    }
    if (q.length) arm()
  }
  const arm = () => {
    armed = true
    const left = q[0].at - now()
    if (left > EARLY + 0.3) setTimeout(flush, left - EARLY)
    else setImmediate(flush)
  }
  return (chunk) => {
    q.push({ at: now() + ms() / 2, chunk })
    if (!armed) arm()
  }
}

export function createProxy({ port: target = 5432, host = '127.0.0.1', rtt = 0 } = {}) {
  let delay = rtt,
    stats = empty(),
    open = 0,
    peak = 0
  const sockets = new Set()
  const server = net.createServer((client) => {
    const upstream = net.connect(target, host)
    client.setNoDelay(true)
    upstream.setNoDelay(true)
    sockets.add(client)
    sockets.add(upstream)
    stats.connections++
    peak = Math.max(peak, ++open)
    const up = delayed(upstream, () => delay),
      down = delayed(client, () => delay),
      read = frontend(() => stats.queries++)
    let last = 's'
    client.on('data', (c) => {
      if (last === 's') stats.roundTrips++
      last = 'c'
      stats.bytesUp += c.length
      read(c)
      up(c)
    })
    upstream.on('data', (c) => {
      last = 's'
      stats.bytesDown += c.length
      down(c)
    })
    client.on('end', () => up(null))
    upstream.on('end', () => down(null))
    const gone = () => {
      client.destroy()
      upstream.destroy()
    }
    client.on('error', gone)
    upstream.on('error', gone)
    client.on('close', () => {
      sockets.delete(client)
      open--
      upstream.end()
    })
    upstream.on('close', () => {
      sockets.delete(upstream)
      client.end()
    })
  })
  return {
    listen: (port = 0) =>
      new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server.address().port))),
    rtt: (ms) => {
      delay = ms
    },
    stats: () => ({ ...stats, open, peak, rtt: delay }),
    reset: () => {
      stats = empty()
      peak = open
    },
    close: () =>
      new Promise((ok) => {
        for (const s of sockets) s.destroy()
        server.close(ok)
      }),
  }
}

/** The proxy in a child process, driven over IPC. */
export async function spawnProxy(options) {
  const child = fork(fileURLToPath(import.meta.url), [JSON.stringify(options)], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  process.on('exit', () => child.kill('SIGKILL'))
  let id = 0
  const waiting = new Map(),
    port = await new Promise((ok, no) => {
      child.once('message', (m) => ok(m.port))
      child.once('error', no)
    })
  child.on('message', (m) => {
    waiting.get(m.id)?.(m.value)
    waiting.delete(m.id)
  })
  const ask = (op, arg) =>
    new Promise((ok) => {
      waiting.set(++id, ok)
      child.send({ id, op, arg })
    })
  return {
    port,
    rtt: (ms) => ask('rtt', ms),
    stats: () => ask('stats'),
    reset: () => ask('reset'),
    stop: () =>
      new Promise((ok) => {
        child.once('exit', ok)
        child.kill()
      }),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const proxy = createProxy(JSON.parse(process.argv[2] ?? '{}'))
  process.send({ port: await proxy.listen() })
  process.on('message', ({ id, op, arg }) => process.send({ id, value: proxy[op](arg) ?? null }))
  process.on('disconnect', () => process.exit(0))
}
