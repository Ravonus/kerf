import { CLIENT_IP, decodeForm } from '../data'
import type { Scope } from '../exec'

/** The request with the socket's address in CLIENT_IP, replacing any the client sent. Nitro's server sets `.ip`. */
export function stamped(request: Request): Request {
  const headers = new Headers(request.headers)
  const { ip } = request as Request & { ip?: string }
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

/** The cookies and headers server functions set (`ctx.response.headers`), on the response. */
export function withHeaders(res: Response, scope: Scope): Response {
  for (const [k, v] of scope.headers) res.headers.append(k, v)
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
