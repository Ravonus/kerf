import http from 'node:http'
import { brotliCompressSync, constants } from 'node:zlib'
import { median } from '../stats.mjs'

function timedGet({ agent, hostname, port, path, cookie }, m) {
  return new Promise((ok) => {
    const t = performance.now()
    let tail = '',
      seen = false
    const headers = {
      'accept-encoding': 'identity',
      accept: 'text/html',
      ...(cookie && { cookie }),
    }
    http
      .get({ agent, hostname, port, path, headers }, (r) => {
        m.first.push(performance.now() - t)
        r.setEncoding('latin1')
        r.on('data', (d) => {
          if (!seen && (tail + d).includes('</head>')) {
            seen = true
            m.head.push(performance.now() - t)
          }
          tail = d.slice(-6)
        })
        r.on('end', () => {
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

function percentiles({ first, head, bad }) {
  first.sort((a, b) => a - b)
  const at = (p) => first[Math.min(first.length - 1, Math.floor(first.length * p))] ?? null
  return {
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    head: head.length ? median(head) : null,
    errors: bad,
  }
}

/** Time to first byte and to the `</head>` byte, closed loop. Uncompressed: a compressed stream hides where the byte is. */
export function ttfbPass(url, { connections = 10, seconds = 2, cookie } = {}) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections }),
    { hostname, port, pathname, search } = new URL(url)
  const m = { first: [], head: [], bad: 0 },
    end = performance.now() + seconds * 1000
  const target = { agent, hostname, port, path: pathname + search, cookie }
  const one = () => (performance.now() > end ? undefined : timedGet(target, m).then(one))
  return Promise.all(Array.from({ length: connections }, one)).then(() => {
    agent.destroy()
    return percentiles(m)
  })
}

const br = (s) =>
  brotliCompressSync(Buffer.from(s), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

/** A page's HTML in two: embedded data, being every inline script's body, and the markup around it. */
export function splitHtml(html) {
  let data = ''
  const markup = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, body) => {
    data += body
    return ''
  })
  return {
    html: { raw: Buffer.byteLength(markup), br: br(markup) },
    data: { raw: Buffer.byteLength(data), br: data ? br(data) : 0 },
  }
}

export async function htmlPass(url, { cookie } = {}) {
  const r = await fetch(url, {
    headers: { 'accept-encoding': 'identity', ...(cookie && { cookie }) },
  })
  return splitHtml(await r.text())
}
