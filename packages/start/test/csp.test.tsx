// Real page responses must share one fresh nonce through cold/warm heads and streamed Boundaries.
import { expect, test } from 'vitest'
import { Boundary, resource } from '@kerf-js/core'
import { serve } from './stream.fixture'
import { nonceScripts, scriptNonce, securityHeaders, secured } from '../src/server/security'
import type { HandlerOptions } from '../src/server/types'

const policy =
  "default-src 'self'; script-src 'nonce-{kerf}' 'strict-dynamic'; style-src 'unsafe-inline'"
const site = { security: { 'Content-Security-Policy': policy } }

test('a request owns a random nonce and separate requests cannot reuse it', () => {
  const options = { site } as unknown as HandlerOptions
  const request = new Request('https://example.test')
  const nonce = scriptNonce(request, options)
  expect(nonce).toMatch(/^[a-f0-9]{48}$/)
  expect(scriptNonce(request, options)).toBe(nonce)
  expect(scriptNonce(new Request(request), options)).not.toBe(nonce)
  expect(
    Object.fromEntries(securityHeaders(request, options))['content-security-policy'],
  ).toContain(`'nonce-${nonce}'`)
  expect(scriptNonce(request, { site: { security: false } } as HandlerOptions)).toBeUndefined()
  expect(nonceScripts('<scripture>text</scripture>', nonce)).toBe('<scripture>text</scripture>')
})

test('nonce documents cannot enter a shared cache and a 304 keeps the cached CSP', () => {
  const request = new Request('https://example.test')
  const options = { site } as unknown as HandlerOptions
  const page = secured(
    new Response('page', {
      headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=600' },
    }),
    request,
    options,
  )
  expect(page.headers.get('cache-control')).toBe('private, no-cache')
  const cached = secured(new Response(null, { status: 304 }), request, options)
  expect(cached.headers.has('content-security-policy')).toBe(false)
})

test('complete pages authorize generated scripts, never raw app HTML, on repeat requests', async () => {
  const get = serve(
    {
      '/': () => (
        <main dangerouslySetInnerHTML={{ __html: '<script>window.injected=true</script>' }} />
      ),
    },
    { site, assets: { entry: '/entry.js', js: [{ href: '/dep.js' }] } },
  )
  let previous = ''
  for (let n = 0; n < 2; n++) {
    const response = await get('/')
    const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy')!)?.[1]
    const html = await response.text()
    expect(nonce).toBeTruthy()
    expect(nonce).not.toBe(previous)
    expect(html).toContain(`<link nonce="${nonce}" rel="modulepreload" href="/dep.js">`)
    expect(html).toContain(`<script nonce="${nonce}" type="module" src="/entry.js">`)
    expect(html).toContain('<script>window.injected=true</script>')
    expect(html).not.toContain(`<script nonce="${nonce}">window.injected`)
    previous = nonce!
  }
})

test('a pending Boundary gets the same nonce without buffering the whole response', async () => {
  let resolve!: (value: string) => void
  const pending = new Promise<string>((done) => {
    resolve = done
  })
  const Late = () => {
    const r = resource(() => pending)
    return <p>{r.value}</p>
  }
  const get = serve(
    {
      '/': () => (
        <main>
          <Boundary pending={<p>Waiting</p>}>
            <Late />
          </Boundary>
        </main>
      ),
    },
    { site, assets: { entry: '/entry.js', js: [{ href: '/dep.js' }] } },
  )
  const response = await get('/')
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy')!)?.[1]
  const reader = response.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  expect(first).toContain('Waiting')
  resolve('Ready')
  let tail = ''
  for (;;) {
    const part = await reader.read()
    if (part.done) break
    tail += new TextDecoder().decode(part.value)
  }
  expect(tail).toContain('Ready')
  expect(tail).toContain(`<script nonce="${nonce}">`)
  expect(tail).not.toMatch(/<script>(?:\$wb|\[)/)
})
