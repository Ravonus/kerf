// Public, same-origin HLS responses enter the ordinary HTTP cache, shared with playback.
/** Refuse speculative requests outside the public site origin. */
export function warmUrl(value: string, base: string): string {
  const url = new URL(value, base)
  if (url.origin !== new URL(location.href).origin || !/^https?:$/.test(url.protocol))
    throw new Error('Media warming requires a same-origin HTTP resource')
  return url.href
}

/** Fill the ordinary HTTP cache while bounding each response body. */
export async function warmFetch(
  url: string,
  signal: AbortSignal,
  limit: number,
  consume: (bytes: number) => void,
): Promise<string> {
  const response = await fetch(warmUrl(url, location.href), {
    signal,
    cache: 'force-cache',
    credentials: 'same-origin',
    redirect: 'error',
    priority: 'low',
  })
  if (!response.ok || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new Error('Media warm response unavailable or over budget')
  }
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = '',
    bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return text
      consume(next.value.length)
      bytes += next.value.length
      if (bytes > limit) throw new Error('Media warm response exceeds budget')
      if (/mpegurl/i.test(response.headers.get('content-type') ?? '') || /\.m3u8(?:\?|$)/.test(url))
        text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** The initialization fragment and first complete media fragment of an HLS playlist. */
export function playlistStarts(text: string, base: string): { init?: string; first?: string } {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const init = /#EXT-X-MAP:.*?URI="([^"]+)"/.exec(text)?.[1]
  const first = lines.find((line) => line && !line.startsWith('#'))
  return {
    ...(init ? { init: warmUrl(init, base) } : {}),
    ...(first ? { first: warmUrl(first, base) } : {}),
  }
}

/** Candidate renditions in a master playlist, preserving their source order. */
export function playlistLevels(text: string, base: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  return lines.flatMap((line, index) => {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) return []
    const size = /RESOLUTION=(\d+)x(\d+)/.exec(line)
    const uri = lines.slice(index + 1).find((value) => value && !value.startsWith('#'))
    return uri
      ? [
          {
            url: warmUrl(uri, base),
            width: Number(size?.[1] ?? 0),
            height: Number(size?.[2] ?? 0),
            bitrate: Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0),
          },
        ]
      : []
  })
}
