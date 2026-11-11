import { CLIENT_IP, decodeForm, StartError } from '../data'
import type { Scope } from '../exec'

/**
 * Who sent the request. Without `trustProxy` it's the socket's address (Nitro's server sets `.ip`). Behind `n` proxies
 * it's the `n`th address from the right of `X-Forwarded-For`: each proxy appends who it heard from, so the entries left
 * of that are whatever the client wrote, and the socket is the nearest proxy itself.
 */
export function clientIp(request: Request, trustProxy?: boolean | number): string | undefined {
  const { ip } = request as Request & { ip?: string }
  const hops = trustProxy === true ? 1 : trustProxy || 0
  if (!hops) return ip
  const chain = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  return chain[chain.length - hops] ?? chain[0] ?? ip
}

/** The request with the client's address (`clientIp`) in CLIENT_IP, replacing any the client sent. */
export function stamped(request: Request, trustProxy?: boolean | number): Request {
  const headers = new Headers(request.headers)
  const ip = clientIp(request, trustProxy)
  headers.delete(CLIENT_IP)
  if (ip) headers.set(CLIENT_IP, ip)
  // `new Request(request, …)` refuses the server's request wrapper; the parts are enough.
  return new Request(request.url, {
    method: request.method,
    headers,
    ...(request.body && { body: request.body, duplex: 'half' }),
  })
}

/** The request's cookies for `persist: 'cookie'`, parsed on first read: a page with none pays nothing. */
export function cookieJar(request: Request) {
  let jar: Map<string, string> | undefined
  return {
    get(name: string) {
      jar ??= new Map(
        (request.headers.get('cookie') ?? '')
          .split(/;\s*/)
          .map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]),
      )
      return jar.get(name)
    },
  }
}

const refresh = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '[]')

/** The multipart body `<Form>` sends when a form holds a file: the fields, and the refresh list in `$r`. */
export async function multipartBody(request: Request) {
  const data = await request.formData()
  return {
    i: decodeForm(data),
    f: JSON.parse(refresh(data.get('$r'))) as [string, unknown][],
    c: 1 as const,
  }
}

/** What a failed form's page gives back: no secrets (the HTML outlives the request) and no files. */
export function echoed(input: Record<string, unknown>): Record<string, unknown> {
  const keep = (v: unknown): unknown =>
    typeof v === 'string'
      ? v
      : Array.isArray(v)
        ? v.filter((x) => typeof x === 'string')
        : v && typeof v === 'object' && !(v instanceof Blob)
          ? echoed(v as Record<string, unknown>)
          : undefined
  return Object.fromEntries(
    Object.entries(input)
      .filter(([k]) => !/pass|secret|token|card|cvv|cvc/i.test(k))
      .map(([k, v]) => [k, keep(v)]),
  )
}

/**
 * The cookies and headers server functions set (`ctx.response.headers`), on the response. Cookies add up and `Vary`
 * merges; any other header the app set replaces Weft's default (a route's `cache-control` over `private, no-cache`).
 */
export function withHeaders(res: Response, scope: Scope): Response {
  for (const cookie of scope.headers.getSetCookie()) res.headers.append('set-cookie', cookie)
  for (const [k, v] of scope.headers) {
    if (k === 'set-cookie') continue
    if (k !== 'vary') res.headers.set(k, v)
    else {
      const names = (res.headers.get('vary') ?? '')
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      for (const name of v.split(',').map((n) => n.trim()))
        if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name)
      res.headers.set('vary', names.join(', '))
    }
  }
  return res
}

/** Merge scope headers, then replace metadata for the redirect's new response body. */
export function redirectBody(
  res: Response,
  scope: Scope,
  type: string,
  location?: string,
): Response {
  withHeaders(res, scope)
  for (const name of [
    'content-length',
    'content-encoding',
    'content-range',
    'content-location',
    'content-language',
    'content-disposition',
    'transfer-encoding',
    'trailer',
    'accept-ranges',
    'etag',
    'last-modified',
    'digest',
    'content-digest',
    'repr-digest',
    'content-md5',
  ])
    res.headers.delete(name)
  res.headers.set('content-type', type)
  if (location === undefined) res.headers.delete('location')
  else res.headers.set('location', location)
  return res
}

/** Whether `If-None-Match` names `etag` (a list, weak `W/` forms and `*` included). No ETag never matches. */
export function etagMatches(request: Request, etag: string | null): boolean {
  if (!etag) return false
  const header = request.headers.get('if-none-match')
  if (!header) return false
  return header.split(',').some((candidate) => {
    const tag = candidate.trim()
    return tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, '')
  })
}

/** The default request body limits: JSON 1 MB, multipart (a form with files) 25 MB. `site.limits` changes them. */
export const LIMITS = { body: 1 << 20, upload: 25 << 20 }

/** The limit for this request's body under `site.limits`: multipart bodies get `upload`, others `body`. */
export function bodyLimit(
  limits: { body?: number | undefined; upload?: number | undefined } | undefined,
  request: Request,
) {
  const multipart = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data')
  return multipart ? (limits?.upload ?? LIMITS.upload) : (limits?.body ?? LIMITS.body)
}

const tooLarge = (max: number) =>
  new StartError(
    'Q018',
    `the request body is over ${max} bytes`,
    'send less, or raise `site.limits`',
    {
      status: 413,
    },
  )

/**
 * The request with its body read up to `max` bytes: a declared `Content-Length` over it is refused before any is
 * read, and a stream that runs past it is cancelled there (Q018, 413), so a huge body never sits in memory.
 */
export async function limited(request: Request, max: number): Promise<Request> {
  if (Number(request.headers.get('content-length')) > max) throw tooLarge(max)
  if (!request.body) return request
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      void reader.cancel()
      throw tooLarge(max)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  return new Request(request.url, { method: request.method, headers: request.headers, body })
}
