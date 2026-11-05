import type * as NodeZlib from 'node:zlib'

/** A complete page's text. Its Response holds no body until `compressed` gives it one: compressed, it's never read. */
export const whole = new WeakMap<Response, string>()

type Encoding = 'br' | 'gzip'
type Zlib = typeof NodeZlib

let loaded: Promise<Zlib | undefined> | undefined
const loadZlib = () => (loaded ??= import('node:zlib').catch(() => undefined))
const brotli = (zlib: Zlib, sizeHint: number) => ({
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: sizeHint,
  },
})

const PACKED_MAX = 16 * 1024 * 1024 // characters of text held, per encoding
const PACKED_ENTRY_MAX = 1024 * 1024

/**
 * Compressed bodies by their whole text, most recently used last. The text is the key, not a hash of it, so a response
 * is only ever reused for the same bytes: two users can share an entry only if each was already being sent that page.
 */
const packed: Record<Encoding, { entries: Map<string, Promise<Uint8Array>>; held: number }> = {
  br: { entries: new Map(), held: 0 },
  gzip: { entries: new Map(), held: 0 },
}

function compressWhole(zlib: Zlib, encoding: Encoding, text: string): Promise<Uint8Array> {
  const cache = packed[encoding]
  const hit = cache.entries.get(text)
  if (hit) {
    cache.entries.delete(text)
    cache.entries.set(text, hit)
    return hit
  }
  const out = new Promise<Uint8Array>((ok, no) => {
    const done = (e: Error | null, b: Buffer) => (e ? no(e) : ok(b))
    if (encoding === 'br') zlib.brotliCompress(text, brotli(zlib, Buffer.byteLength(text)), done)
    else zlib.gzip(text, done)
  })
  if (text.length > PACKED_ENTRY_MAX) return out
  cache.entries.set(text, out)
  cache.held += text.length
  for (const key of cache.entries.keys()) {
    if (cache.held <= PACKED_MAX) break
    cache.entries.delete(key)
    cache.held -= key.length
  }
  return out
}

/** A stream of chunks, each flushed as it arrives so a Boundary reaches the client when it resolves. */
function compressStream(
  zlib: Zlib,
  encoding: Encoding,
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const z = encoding === 'br' ? zlib.createBrotliCompress(brotli(zlib, 0)) : zlib.createGzip()
  const reader = source.getReader()
  return new ReadableStream<Uint8Array>({
    start(out) {
      z.on('data', (d: Buffer) => out.enqueue(new Uint8Array(d)))
      z.on('end', () => out.close())
      z.on('error', (e) => out.error(e))
      ;(async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return void z.end()
          z.write(value)
          await new Promise((ok) => {
            z.flush(ok as () => void)
          })
        }
      })().catch((e) => out.error(e))
    },
    cancel(reason) {
      z.destroy()
      return reader.cancel(reason)
    },
  })
}

/**
 * HTML and data go out brotli or gzipped when the client takes it. A response that is complete is compressed once and
 * kept, since most pages come out the same for every visitor; one still streaming is flushed chunk by chunk. A runtime
 * with no node:zlib sits behind a platform that compresses.
 */
export async function compressed(request: Request, response: Response): Promise<Response> {
  const page = whole.get(response)
  const plain = () => (page === undefined ? response : new Response(page, response))
  if (page === undefined && (!response.body || response.headers.has('content-encoding')))
    return response
  const type = response.headers.get('content-type') ?? ''
  if (!/^(text\/html|application\/json)/.test(type)) return plain()
  const accepts = request.headers.get('accept-encoding') ?? ''
  const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : undefined
  const zlib = encoding && (await loadZlib())
  if (!zlib) return plain()
  const text = page ?? (type.startsWith('application/json') ? await response.text() : undefined)
  const body =
    text === undefined
      ? compressStream(zlib, encoding, response.body!)
      : await compressWhole(zlib, encoding, text)
  const headers = new Headers(response.headers)
  headers.set('content-encoding', encoding)
  headers.append('vary', 'Accept-Encoding')
  headers.delete('content-length')
  return new Response(body as BodyInit, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
