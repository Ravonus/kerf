import http from 'node:http'
import { brotliCompressSync, constants } from 'node:zlib'
import { median } from '../stats.mjs'

/** Time to first byte and to the `</head>` byte, closed loop. Uncompressed: a compressed stream hides where the byte is. */
export function ttfbPass(url, { connections = 10, seconds = 2, cookie } = {}) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections }),
    { hostname, port, pathname, search } = new URL(url)
  const first = [],
    head = [],
    end = performance.now() + seconds * 1000
  let bad = 0
  const one = () =>
    new Promise((ok) => {
      if (performance.now() > end) return ok()
      const t = performance.now()
      let tail = '',
        seen = false
      http
        .get(
          {
            agent,
            hostname,
            port,
            path: pathname + search,
            headers: {
              'accept-encoding': 'identity',
              accept: 'text/html',
              ...(cookie && { cookie }),
            },
          },
          (r) => {
            first.push(performance.now() - t)
            r.setEncoding('latin1')
            r.on('data', (d) => {
              if (!seen && (tail + d).includes('</head>')) {
                seen = true
                head.push(performance.now() - t)
              }
              tail = d.slice(-6)
            })
            r.on('end', () => {
              if (r.statusCode >= 400) bad++
              ok(one())
            })
          },
        )
        .on('error', () => {
          bad++
          ok(one())
        })
    })
  return Promise.all(Array.from({ length: connections }, one)).then(() => {
    agent.destroy()
    first.sort((a, b) => a - b)
    const at = (p) => first[Math.min(first.length - 1, Math.floor(first.length * p))] ?? null
    return {
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      head: head.length ? median(head) : null,
      errors: bad,
    }
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
