// TLS termination must preserve the same-origin proof, without trusting client-supplied forwarding or changing URLs.
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
  type IncomingHttpHeaders,
  type ServerResponse,
} from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, test } from 'vitest'
import { mutation } from '../src/data'
import { createScope } from '../src/exec'
import { createHandler } from '../src/server'
import { externalOrigin } from '../src/server/origin'
import { serverFunction } from '../src/server/functions'
import { makeForm } from '../src/server/form'
import type { HandlerOptions } from '../src/server/types'

const internal = 'http://internal.test:3000'
const publicOrigin = 'https://contracts.test'
const forwarded = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'contracts.test' }
const req = (headers: Record<string, string> = {}, base = internal) =>
  new Request(`${base}/_kerf/fn/proxy.write?tab=2`, { headers })

describe('external origin', () => {
  test('forwarding is ignored without explicit trust, including malformed headers', () => {
    for (const trust of [undefined, false, 0]) {
      expect(externalOrigin(req(forwarded), trust)).toBe(internal)
      expect(externalOrigin(req({ 'x-forwarded-proto': 'javascript' }), trust)).toBe(internal)
    }
  })

  test('one trusted proxy supplies the origin, or preserves the public Host with only a protocol', () => {
    expect(externalOrigin(req(forwarded), true)).toBe(publicOrigin)
    expect(externalOrigin(req(forwarded), 1)).toBe(publicOrigin)
    expect(
      externalOrigin(req({ 'x-forwarded-proto': 'https' }, 'http://contracts.test'), true),
    ).toBe(publicOrigin)
    expect(externalOrigin(req(), true)).toBe(internal)
    expect(externalOrigin(req({}, 'http://localhost:5173'), 2)).toBe('http://localhost:5173')
    expect(externalOrigin(req({ 'x-forwarded-proto': 'http' }), true)).toBe(internal)
  })

  test('the same trusted hop selects both headers; client prefixes never become the origin', () => {
    const headers = {
      'x-forwarded-proto': 'http, https, http',
      'x-forwarded-host': 'attacker.test, contracts.test, edge.internal:8080',
    }
    expect(externalOrigin(req(headers), true)).toBe('http://edge.internal:8080')
    expect(externalOrigin(req(headers), 2)).toBe(publicOrigin)
    expect(
      externalOrigin(req({ 'x-forwarded-proto': 'http, https' }, 'http://contracts.test'), true),
    ).toBe(publicOrigin)
  })

  test.each(['contracts.test:8443', '[2001:db8::1]:8443', '[::1]', 'LOCALHOST:443'])(
    'valid authorities canonicalise like a browser Origin: %s',
    (host) => {
      expect(externalOrigin(req({ ...forwarded, 'x-forwarded-host': host }), true)).toBe(
        new URL(`https://${host}`).origin,
      )
    },
  )

  test.each([
    '',
    'contracts.test:',
    'contracts.test:abc',
    'contracts.test:65536',
    'user@contracts.test',
    'contracts.test/path',
    'contracts.test\\evil',
    'contracts.test?x=1',
    'contracts.test#frag',
    'contracts .test',
    'https://contracts.test',
    '[not:ipv6]',
    '[::1',
    'contracts.test%2fevil',
  ])('malformed authority fails closed: %j', (host) => {
    expect(externalOrigin(req({ ...forwarded, 'x-forwarded-host': host }), true)).toBeNull()
  })

  test.each([
    { ...forwarded, 'x-forwarded-proto': '' },
    { ...forwarded, 'x-forwarded-proto': 'ftp' },
    { ...forwarded, 'x-forwarded-proto': 'https:' },
    { ...forwarded, 'x-forwarded-proto': 'https, http' },
    { ...forwarded, 'x-forwarded-host': 'prefix.test, contracts.test' },
    { ...forwarded, 'x-forwarded-proto': ', https' },
    { 'x-forwarded-host': 'contracts.test' },
  ])('malformed or unpaired forwarding fails closed: %j', (headers) => {
    expect(externalOrigin(req(headers), true)).toBeNull()
  })

  test('a short chain never falls back to an untrusted entry; invalid hop counts and TLS downgrade fail closed', () => {
    expect(externalOrigin(req(forwarded), 2)).toBeNull()
    for (const trust of [-1, 0.5, NaN, Infinity])
      expect(externalOrigin(req(forwarded), trust)).toBeNull()
    expect(externalOrigin(req({ 'x-forwarded-proto': 'http' }, publicOrigin), true)).toBeNull()
  })
})

mutation({
  $id: 'proxy.write',
  auth: 'public',
  run: ({ ctx, input }) => ({ url: ctx.request.url, input }),
})
mutation({ $id: 'proxy.private', auth: 'user', run: () => 'private' })
const options = (trustProxy?: boolean | number): HandlerOptions => ({
  manifest: { dir: 'src/routes', layouts: [], routes: [] },
  modules: {},
  site: { ...(trustProxy !== undefined && { trustProxy }) },
  context: () => ({ user: null }),
  onDiagnostic: () => {},
})
const post = (headers: Record<string, string> = {}, name = 'proxy.write', base = internal) =>
  new Request(`${base}/_kerf/fn/${name}?tab=2`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kerf': '1', ...headers },
    body: JSON.stringify({ i: { title: 'A contract' } }),
  })
const call = (request: Request, trustProxy?: boolean | number) => {
  const o = options(trustProxy)
  return serverFunction(
    o,
    new URL(request.url),
    request,
    createScope(request, { context: () => ({ user: null }) }),
  )
}
const formPost = (headers: Record<string, string> = {}, base = internal) =>
  new Request(`${base}/contract?tab=2`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ $fn: 'proxy.write', title: 'A contract' }),
  })
const formCall = (request: Request, trustProxy?: boolean | number) => {
  const o = options(trustProxy)
  return makeForm(o, () => Promise.resolve(new Response('form failure')))(
    new URL(request.url),
    request,
    createScope(request, { context: () => ({ user: null }) }),
  )
}

describe('native mutation proof through a trusted proxy', () => {
  test('valid public HTTPS reaches the resolver unchanged, and unsigned private calls reach auth', async () => {
    const response = await call(post({ ...forwarded, origin: publicOrigin }), true)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      v: { url: `${internal}/_kerf/fn/proxy.write?tab=2`, input: { title: 'A contract' } },
    })
    const denied = await call(post({ ...forwarded, origin: publicOrigin }, 'proxy.private'), true)
    expect(denied.status).toBe(401)
    expect(await denied.json()).toMatchObject({ e: { code: 'A002' } })
  })

  test('forwarded-only attacks cannot change the origin without trust; local dev remains valid', async () => {
    expect((await call(post({ ...forwarded, origin: publicOrigin }))).status).toBe(403)
    expect((await call(post({ ...forwarded, origin: internal }))).status).toBe(200)
    expect((await call(post({ origin: internal }), true)).status).toBe(200)
    expect((await call(post({ 'x-forwarded-proto': 'http', origin: internal }), true)).status).toBe(
      200,
    )
    expect((await call(post({ ...forwarded, origin: publicOrigin }), 2)).status).toBe(403)
  })

  test.each([
    { origin: 'https://attacker.test' },
    { origin: 'null' },
    { origin: internal },
    { origin: publicOrigin, 'sec-fetch-site': 'cross-site' },
    { origin: publicOrigin, 'sec-fetch-site': 'same-site' },
    { origin: publicOrigin, 'x-kerf': '' },
    { origin: publicOrigin, 'content-type': 'text/plain' },
    { origin: publicOrigin, 'x-forwarded-host': 'user@contracts.test' },
    { 'x-forwarded-proto': 'javascript', 'sec-fetch-site': 'same-origin' },
  ])('wrong proof still refuses before execution: %j', async (headers) => {
    const response = await call(post({ ...forwarded, ...headers }), true)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ e: { code: 'Q010' } })
  })

  test('same-origin/none fetch metadata and multipart keep their existing proof rules', async () => {
    for (const from of ['same-origin', 'none'])
      expect(
        (await call(post({ ...forwarded, origin: publicOrigin, 'sec-fetch-site': from }), true))
          .status,
      ).toBe(200)
    const body = new FormData()
    body.set('title', 'Uploaded contract')
    const request = new Request(`${internal}/_kerf/fn/proxy.write`, {
      method: 'POST',
      body,
      headers: { ...forwarded, origin: publicOrigin, 'x-kerf': '1' },
    })
    expect((await call(request, true)).status).toBe(200)
  })
})

describe('native form proof through a trusted proxy', () => {
  test('public HTTPS preserves POST/Redirect/Get and its original path/query', async () => {
    const response = await formCall(formPost({ ...forwarded, origin: publicOrigin }), true)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/contract?tab=2')
    expect(
      (await formCall(formPost({ ...forwarded, 'sec-fetch-site': 'same-origin' }), true)).status,
    ).toBe(303)
    expect((await formCall(formPost({ origin: internal }), true)).status).toBe(303)
  })

  test.each([
    {},
    { origin: 'null' },
    { origin: 'https://attacker.test' },
    { origin: internal },
    { origin: publicOrigin, 'sec-fetch-site': 'cross-site' },
    { origin: publicOrigin, 'sec-fetch-site': 'same-site' },
    { origin: publicOrigin, 'sec-fetch-site': 'none' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'same-origin', 'x-forwarded-proto': 'ftp' },
  ])('the original form proof remains mandatory: %j', async (headers) => {
    expect((await formCall(formPost({ ...forwarded, ...headers }), true)).status).toBe(403)
  })

  test('without trust spoofed forwarding is ignored', async () => {
    expect((await formCall(formPost({ ...forwarded, origin: publicOrigin }))).status).toBe(403)
    expect((await formCall(formPost({ ...forwarded, origin: internal }))).status).toBe(303)
  })
})

const listen = (server: Server) =>
  new Promise<string>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('No TCP listener'))
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
const close = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => (error ? reject(error) : resolve()))
  })
const bodyOf = (request: IncomingMessage) =>
  new Response(Readable.toWeb(request) as ReadableStream<Uint8Array>).text()
const reply = async (response: Response, out: ServerResponse) => {
  const body = Buffer.from(await response.arrayBuffer())
  out.writeHead(response.status, Object.fromEntries(response.headers))
  out.end(body)
}

test('mounted handler behind a real HTTP proxy accepts public TLS proof and refuses cross-origin writes', async () => {
  const handler = createHandler(options(true))
  const backend = createServer((incoming, out) => {
    void (async () => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value)
      const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
        method: 'POST',
        headers,
        body: await bodyOf(incoming),
      })
      await reply(await handler(request), out)
    })().catch(() => {
      if (!out.headersSent) out.writeHead(500)
      out.end('Backend failed')
    })
  })
  const backendUrl = await listen(backend)
  const proxy = createServer((incoming, out) => {
    // The TLS edge replaces forwarding and preserves the public Host on its actual HTTP upstream.
    const headers: IncomingHttpHeaders = {
      ...incoming.headers,
      host: 'contracts.test',
      'x-forwarded-proto': 'https',
      'accept-encoding': 'identity',
    }
    delete headers['x-forwarded-host']
    const upstream = httpRequest(
      backendUrl + incoming.url,
      { method: 'POST', headers },
      (received) => {
        out.writeHead(received.statusCode ?? 502, received.headers)
        received.pipe(out)
      },
    )
    upstream.on('error', () => {
      if (!out.headersSent) out.writeHead(502)
      out.end('Proxy failed')
    })
    incoming.pipe(upstream)
  })
  try {
    const proxyUrl = await listen(proxy)
    const send = (name: string, origin: string) =>
      fetch(`${proxyUrl}/_kerf/fn/${name}?tab=2`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-kerf': '1' },
        body: JSON.stringify({ i: { title: 'Through the edge' } }),
      })
    const accepted = await send('proxy.write', publicOrigin)
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({
      v: { url: 'http://contracts.test/_kerf/fn/proxy.write?tab=2' },
    })
    const auth = await send('proxy.private', publicOrigin)
    expect(auth.status).toBe(401)
    expect(await auth.json()).toMatchObject({ e: { code: 'A002' } })
    for (const origin of ['https://attacker.test', 'null', 'http://contracts.test'])
      expect((await send('proxy.write', origin)).status).toBe(403)
    const form = await fetch(`${proxyUrl}/contract?tab=2`, {
      method: 'POST',
      headers: { origin: publicOrigin },
      body: new URLSearchParams({ $fn: 'proxy.write', title: 'From a form' }),
      redirect: 'manual',
    })
    expect(form.status).toBe(303)
    expect(form.headers.get('location')).toBe('/contract?tab=2')
  } finally {
    await close(proxy)
    await close(backend)
  }
})
