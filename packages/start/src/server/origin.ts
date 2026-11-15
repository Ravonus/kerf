// CSRF uses the public origin behind an explicitly trusted proxy, without changing routing or cache URLs.

/** The browser's origin from an explicitly trusted hop, or null for malformed/short forwarding or TLS downgrades. */
export function externalOrigin(request: Request, trustProxy?: boolean | number): string | null {
  const url = new URL(request.url)
  if (trustProxy === undefined || trustProxy === false || trustProxy === 0) return url.origin
  const hops = trustProxy === true ? 1 : trustProxy
  if (!Number.isSafeInteger(hops) || hops < 1) return null
  const proto = request.headers.get('x-forwarded-proto')
  const host = request.headers.get('x-forwarded-host')
  if (proto === null && host === null) return url.origin
  if (proto === null) return null
  const protocols = proto.split(',').map((part) => part.trim())
  const hosts = host === null ? null : host.split(',').map((part) => part.trim())
  if (
    protocols.length < hops ||
    protocols.some((part) => !part) ||
    (hosts && (hosts.length !== protocols.length || hosts.some((part) => !part)))
  )
    return null
  const protocol = protocols[protocols.length - hops]
  if (protocol !== 'http' && protocol !== 'https') return null
  if (url.protocol === 'https:' && protocol !== 'https') return null
  // Proxies that preserve Host may set only X-Forwarded-Proto; do not use an unrelated entry from another hop.
  const authority = hosts ? hosts[hosts.length - hops]! : url.host
  if (!/^(?:[a-z\d_-]+(?:\.[a-z\d_-]+)*\.?|\[[\da-f:.]+\])(?::\d{1,5})?$/i.test(authority))
    return null
  try {
    return new URL(`${protocol}://${authority}`).origin
  } catch {
    return null
  }
}
