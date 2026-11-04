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

/**
 * Fetches every remote `src` in the tree. `allow(url)` decides which hosts a card may load from (the on-demand route
 * renders data from `load`, so this is the SSRF guard); the default allows any https URL.
 * Returns the images Takumi needs, and the srcs that failed.
 */
export async function loadImages(
  srcs,
  {
    cache,
    timeoutMs = 1500,
    maxBytes = 4 << 20,
    allow = (u) => u.protocol === 'https:',
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
        if (!allow(url)) throw new Error('not allowed')
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
