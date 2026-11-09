import http from 'node:http'

function loadGet({ agent, hostname, port, path, encoding, cookie }, m) {
  return new Promise((ok) => {
    const t = performance.now()
    const headers = { 'accept-encoding': encoding, accept: 'text/html', ...(cookie && { cookie }) }
    http
      .get({ agent, hostname, port, path, headers }, (r) => {
        m.served = r.headers['content-encoding'] ?? 'none'
        r.on('data', (d) => (m.bytes += d.length))
        r.on('end', () => {
          m.lat.push(performance.now() - t)
          if (r.statusCode >= 400) m.bad++
          ok()
        })
      })
      .on('error', () => {
        m.bad++
        ok()
      })
  })
}

/** `connections` keep-alive clients as fast as the server answers, for `seconds`, reading whole bodies. */
export function loadPass(
  url,
  { connections = 10, seconds = 2, encoding = 'br, gzip', cookie } = {},
) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections }),
    { hostname, port, pathname, search } = new URL(url)
  const m = { lat: [], bad: 0, bytes: 0, served: 'none' },
    end = performance.now() + seconds * 1000
  const target = { agent, hostname, port, path: pathname + search, encoding, cookie }
  const one = () => (performance.now() > end ? undefined : loadGet(target, m).then(one))
  return Promise.all(Array.from({ length: connections }, one)).then(() => {
    agent.destroy()
    const { lat } = m
    lat.sort((a, b) => a - b)
    return {
      rps: lat.length / seconds,
      p50: lat[lat.length >> 1],
      p95: lat[Math.floor(lat.length * 0.95)],
      errors: m.bad,
      bytes: m.bytes,
      served: m.served,
    }
  })
}
