// Request limits, default security headers, header merging and the card-image SSRF guard, without a server.
import { describe, expect, test } from 'vitest'
import { bodyLimit, LIMITS, limited, withHeaders } from '../src/server/request'
import { secured, securityHeaders } from '../src/server/security'
import { privateAddress, publicHttps, loadImages } from '../src/og/images.mjs'
import type { HandlerOptions } from '../src/server/types'
import type { Scope } from '../src/exec'

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('http://localhost/_weft/fn/x', {
    method: 'POST',
    body,
    headers,
    duplex: 'half',
  } as RequestInit)

describe('body limits', () => {
  test('JSON gets 1 MB and multipart 25 MB by default; site.limits changes either', () => {
    expect(bodyLimit(undefined, post('{}', { 'content-type': 'application/json' }))).toBe(
      LIMITS.body,
    )
    const multipart = post('x', { 'content-type': 'multipart/form-data; boundary=a' })
    expect(bodyLimit(undefined, multipart)).toBe(LIMITS.upload)
    expect(bodyLimit({ upload: 10 }, multipart)).toBe(10)
    expect(bodyLimit({ body: 5 }, post('{}'))).toBe(5)
  })

  test('a body under the limit reads as before', async () => {
    expect(await (await limited(post('{"a":1}'), 100)).json()).toEqual({ a: 1 })
  })

  test('a declared Content-Length over the limit is refused before any of it is read', async () => {
    const req = post('{}', { 'content-length': '5000' })
    await expect(limited(req, 100)).rejects.toMatchObject({ code: 'Q018', extra: { status: 413 } })
    expect(req.bodyUsed).toBe(false)
  })

  test('a streamed body is cut off once it passes the limit', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++
        c.enqueue(new Uint8Array(64))
        if (pulled > 1000) c.close()
      },
    })
    await expect(limited(post(stream), 200)).rejects.toMatchObject({ code: 'Q018' })
    expect(pulled).toBeLessThan(10)
  })
})

describe('security headers', () => {
  const options = (o: Partial<HandlerOptions> = {}) => o as HandlerOptions
  const req = (url = 'http://localhost/', headers: Record<string, string> = {}) =>
    new Request(url, { headers })

  test('every response gets the defaults, HSTS only over https outside dev', () => {
    const plain = Object.fromEntries(securityHeaders(req(), options()))
    expect(plain).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'SAMEORIGIN',
      'cross-origin-opener-policy': 'same-origin-allow-popups',
    })
    expect(plain['strict-transport-security']).toBeUndefined()
    const https = Object.fromEntries(securityHeaders(req('https://a.test/'), options()))
    expect(https['strict-transport-security']).toBe('max-age=31536000')
    const proxied = securityHeaders(req('http://a/', { 'x-forwarded-proto': 'https' }), options())
    expect(Object.fromEntries(proxied)['strict-transport-security']).toBeDefined()
    const dev = securityHeaders(req('https://a.test/'), options({ dev: true }))
    expect(Object.fromEntries(dev)['strict-transport-security']).toBeUndefined()
  })

  test('site.security overrides one, drops one with false, or drops all', () => {
    const site = { security: { 'X-Frame-Options': 'DENY', 'referrer-policy': false } }
    const got = Object.fromEntries(securityHeaders(req(), options({ site } as never)))
    expect(got['x-frame-options']).toBe('DENY')
    expect(got['referrer-policy']).toBeUndefined()
    expect(securityHeaders(req(), options({ site: { security: false } } as never))).toEqual([])
  })

  test("a response's own header wins, and a response with fixed headers is copied", () => {
    const own = secured(
      new Response('x', { headers: { 'x-frame-options': 'DENY' } }),
      req(),
      options(),
    )
    expect(own.headers.get('x-frame-options')).toBe('DENY')
    expect(own.headers.get('x-content-type-options')).toBe('nosniff')
    const fixed = secured(Response.redirect('http://localhost/b', 302), req(), options())
    expect(fixed.status).toBe(302)
    expect(fixed.headers.get('location')).toBe('http://localhost/b')
    expect(fixed.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('headers a function sets', () => {
  const scope = (h: [string, string][]) => {
    const headers = new Headers()
    for (const [k, v] of h) headers.append(k, v)
    return { headers } as unknown as Scope
  }

  test("an app's cache-control replaces the page default instead of joining it; cookies add up; Vary merges", () => {
    const res = new Response('', {
      headers: { 'cache-control': 'private, no-cache', vary: 'Save-Data' },
    })
    withHeaders(
      res,
      scope([
        ['cache-control', 'public, max-age=60'],
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
        ['vary', 'Accept-Language, save-data'],
      ]),
    )
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(res.headers.get('vary')).toBe('Save-Data, Accept-Language')
  })
})

describe('card images', () => {
  test('private, loopback, link-local and CGNAT addresses are private; public ones are not', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ])
      expect(privateAddress(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])
      expect(privateAddress(ip), ip).toBe(false)
  })

  test('the default allow refuses http, localhost and private literals', async () => {
    for (const u of [
      'http://example.com/a.png',
      'https://localhost/a.png',
      'https://127.0.0.1/a.png',
      'https://[::1]/a.png',
      'https://169.254.169.254/latest',
    ])
      expect(await publicHttps(new URL(u)), u).toBe(false)
    expect(await publicHttps(new URL('https://8.8.8.8/a.png'))).toBe(true)
  })

  test('a card image on a private address is never fetched', async () => {
    let fetched = 0
    const { images, failed } = await loadImages(
      ['https://127.0.0.1/a.png', 'https://10.0.0.5/b.png'],
      {
        fetch: () => {
          fetched++
          return Promise.resolve(new Response(''))
        },
      },
    )
    expect(fetched).toBe(0)
    expect(images).toEqual([])
    expect(failed.map((f: { reason: string }) => f.reason)).toEqual(['not allowed', 'not allowed'])
  })
})
