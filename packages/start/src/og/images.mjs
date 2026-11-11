// `<img src>` in a card: fetched at render with a timeout and a size cap (research 20 §4.1), cached by URL, and left
// out of the card (keeping its box, so the layout doesn't move) when the fetch fails, instead of failing the request.

/** An LRU of fetched image bytes by URL, capped by total bytes. */
export function imageCache(maxBytes = 32 << 20) {
  const map = new Map()
  let bytes = 0
  return {
    get(src) {
      const hit = map.get(src)
      if (hit) {
        map.delete(src)
        map.set(src, hit)
      }
      return hit
    },
    set(src, data) {
      if (data.length > maxBytes) return
      map.set(src, data)
      bytes += data.length
      for (const [k, v] of map) {
        if (bytes <= maxBytes) break
        map.delete(k)
        bytes -= v.length
      }
    },
  }
}

/** Whether an IP address is one the open internet can't reach: loopback, private, link-local (cloud metadata), CGNAT… */
export function privateAddress(ip) {
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(ip)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    v6 === '::' ||
    v6 === '::1' ||
    ['fc', 'fd'].some((p) => v6.startsWith(p)) || // unique local
    ['fe8', 'fe9', 'fea', 'feb'].some((p) => v6.startsWith(p)) || // link-local
    v6.startsWith('ff') || // multicast
    v6.startsWith('::ffff:') // mapped v4 in hex form: refused rather than decoded
  )
}

/**
 * The default `allow`: https only, to a host whose every address is public, so a card can't be pointed at the
 * server's own network (`localhost`, `10.…`, `169.254.169.254`). Where there's no DNS module, literal addresses only.
 */
export async function publicHttps(url) {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return false
  if (/^[\d.]+$/.test(host) || host.includes(':')) return !privateAddress(host)
  let dns
  try {
    dns = await import('node:dns/promises')
  } catch {
    return true
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true })
  return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address))
}

/**
 * Fetches every remote `src` in the tree. `allow(url)` (may be async) decides which hosts a card may load from (the
 * on-demand route renders data from `load`, so this is the SSRF guard); the default, `publicHttps`, allows https to
 * public addresses only.
 * Returns the images Takumi needs, and the srcs that failed.
 */
export async function loadImages(
  srcs,
  {
    cache,
    timeoutMs = 1500,
    maxBytes = 4 << 20,
    allow = publicHttps,
    fetch = globalThis.fetch,
  } = {},
) {
  const images = [],
    failed = []
  await Promise.all(
    [...new Set(srcs)].map(async (src) => {
      if (src.startsWith('data:')) return // Takumi decodes data URIs itself
      const hit = cache?.get(src)
      if (hit) return void images.push({ src, data: hit })
      try {
        const url = new URL(src)
        if (!(await allow(url))) throw new Error('not allowed')
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.headers.get('content-type')?.startsWith('image/')) throw new Error('not an image')
        if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error('too large')
        const data = new Uint8Array(await res.arrayBuffer())
        if (data.length > maxBytes) throw new Error('too large')
        cache?.set(src, data)
        images.push({ src, data })
      } catch (e) {
        failed.push({
          src,
          reason:
            e?.name === 'TimeoutError'
              ? `timed out after ${timeoutMs} ms`
              : String(e?.message ?? e),
        })
      }
    }),
  )
  return { images, failed }
}
