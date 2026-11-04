import { createMiddleware } from '@solidjs/start/middleware'
import { toResponse } from 'h3'
import { Duplex } from 'node:stream'
import { constants, createBrotliCompress, createGzip } from 'node:zlib'

/** Nitro compresses the built assets, not rendered pages, so HTML is compressed here. */
export default createMiddleware([
  async (event, next) => {
    const result = await next()
    if (!/^text\/html/i.test(event.res.headers.get('content-type') ?? '')) return result

    const accepts = event.req.headers.get('accept-encoding') ?? ''
    const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : undefined
    if (!encoding) return result

    const response = await toResponse(result, event)
    if (!response.body || response.headers.has('content-encoding')) return response

    const compressor =
      encoding === 'br'
        ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
        : createGzip()
    const headers = new Headers(response.headers)
    headers.set('content-encoding', encoding)
    headers.append('vary', 'Accept-Encoding')
    headers.delete('content-length')
    return new Response(
      response.body.pipeThrough(Duplex.toWeb(compressor) as ReadableWritablePair),
      {
        status: response.status,
        statusText: response.statusText,
        headers,
      },
    )
  },
])
