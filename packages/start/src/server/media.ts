import type { HandlerOptions } from './types'
import type { MediaServer } from '../exec'
import { etagMatches } from './request'
export function makeMedia(
  options: HandlerOptions,
  mediaServer: () => Promise<MediaServer> | undefined,
) {
  /** `/_kerf/m/<hash>/<width>.<fmt>` (research 29 §6): content-addressed, so cached for good; `auto` varies on `Accept`. */
  return async function media(url: URL, request: Request): Promise<Response> {
    const m = /^\/_kerf\/m\/([0-9a-f]{32})\/(\d+)\.([a-z0-9]+)$/.exec(url.pathname)
    const server = await mediaServer()
    if (!server)
      options.onDiagnostic?.({
        code: 'M017',
        severity: 'error',
        message:
          'M017: a media URL was requested, but nothing provides `media.server`. Add `media()` from `@kerf/media` to `plugins`',
      })
    const out =
      m &&
      (await server?.serve({
        hash: m[1]!,
        width: Number(m[2]),
        format: m[3]!,
        accept: request.headers.get('accept') ?? '',
      }))
    if (!out) return new Response('Not found', { status: 404 })
    const headers = new Headers({
      'content-type': out.type,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${m[1]}-${out.width}-${out.format}"`,
      'x-content-type-options': 'nosniff',
    })
    if (out.negotiated) headers.set('vary', 'Accept')
    if (out.type === 'image/svg+xml')
      headers.set(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      )
    if (out.temporary) {
      // The original, standing in for a rung still encoding.
      headers.set('cache-control', 'no-store')
      headers.delete('etag')
    }
    if (etagMatches(request, headers.get('etag')))
      return new Response(null, { status: 304, headers })
    const range =
      /^(video|audio)\//.test(out.type) &&
      /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (!range) return new Response(out.bytes as BodyInit, { headers })
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : Infinity, out.bytes.length - 1)
    if (start > end)
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${out.bytes.length}` },
      })
    headers.set('content-range', `bytes ${start}-${end}/${out.bytes.length}`)
    return new Response(out.bytes.subarray(start, end + 1) as BodyInit, { status: 206, headers })
  }
}
