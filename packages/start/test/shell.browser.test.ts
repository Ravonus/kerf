// A production build runs on two peers while a separate origin serves only release artifacts.
import { execFile } from 'node:child_process'
import { createServer, type ServerResponse } from 'node:http'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { chromium, type Browser, type Page } from 'playwright-core'
import { serve } from './build.setup'

const root = join(import.meta.dirname, 'fixtures/shell')
const output = join(root, '.output-browser-shell')
const entry = join(output, 'server/index.mjs')
const build = {
  root,
  preset: 'node',
  logLevel: 'error',
  site: {
    render: 'shell',
    routeRedirects: { item: '/items/42' },
    name: 'Release',
    title: '%s | Release',
  },
  nitro: { output: { dir: output } },
}
let browser: Browser
let a: Awaited<ReturnType<typeof serve>>
let b: Awaited<ReturnType<typeof serve>>
let address: string
const captured: { peer: string; path: string; headers: Headers; text: Promise<string> }[] = []
const criticMarker = 'CRITIC_MARKER'
const criticCookieRead: (string | undefined)[] = []
const gateway = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost')
  if (/^\/(?:peers\/[ab]\/)?_kerf\/(?:fn\/|rt$|ws$)/.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ v: criticMarker }))
    return
  }
  const peer = /^\/peers\/(a|b)(\/_kerf\/data\/.*)$/.exec(url.pathname)
  if (peer && url.searchParams.has('critic')) criticCookieRead.push(req.headers.cookie)
  const task = peer ? forward(peer[1]!, peer[2]! + url.search, res) : releaseFile(url.pathname, res)
  void task.catch(() => {
    if (!res.headersSent) res.writeHead(404)
    res.end()
  })
})

async function forward(peer: string, path: string, res: ServerResponse) {
  const response = await fetch((peer === 'a' ? a : b).url + path, {
    redirect: 'manual',
    headers: { 'x-fixture-peer': peer, 'accept-encoding': 'identity' },
  })
  if (path.includes('?critic=')) return hostileReply(path, response, res)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) return void res.end()
  const [body, receipt] = response.body.tee()
  const text = new Response(receipt).text()
  void text.catch(() => {})
  captured.push({ peer, path, headers: response.headers, text })
  await pipeline(body, res)
}

async function hostileReply(path: string, reply: Response, res: ServerResponse) {
  const kind = new URL(path, 'http://localhost').searchParams.get('critic')
  const [first, detail] = (await reply.text())
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line))
  if (kind === 'legacy') {
    first.m = [{ s: true, h: `<span id="${criticMarker}">probe</span>` }]
    first.preload = ['/critic-hint.css']
    first.islands = ['critic']
  }
  if (kind === 'headers') {
    first.values[1].label = `<span id="${criticMarker}">probe</span>`
    first.values[1].link = { rel: 'stylesheet', href: '/critic-hint.css' }
  }
  res.writeHead(reply.status, {
    'content-type': 'application/x-ndjson',
    'set-cookie': 'critic-peer=example; Path=/',
    'content-security-policy': "default-src 'none'",
    link: '</critic-hint.css>; rel=preload; as=style',
    refresh: '0; url=/critic-header-target',
    location: '/critic-header-target',
  })
  const outcome =
    kind === 'deferred'
      ? [first, { ...detail, value: { text: criticMarker, extra: 'Unexpected' } }]
      : [first]
  res.end(outcome.map((frame) => JSON.stringify(frame) + '\n').join(''))
}

async function releaseFile(path: string, res: ServerResponse) {
  const asset = path.startsWith('/assets/') || /^\/kerf-route-retry-[a-f0-9]+\.json$/.test(path)
  const file = join(output, 'public', asset ? path : 'kerf-shell.html')
  const type = asset
    ? path.endsWith('.css')
      ? 'text/css'
      : path.endsWith('.json')
        ? 'application/json'
        : 'text/javascript'
    : 'text/html'
  const bytes = await readFile(file)
  res.writeHead(200, { 'content-type': type }).end(bytes)
}

beforeAll(async () => {
  await mkdir(output, { recursive: true })
  await promisify(execFile)(
    process.execPath,
    [join(import.meta.dirname, 'build-app.mjs'), JSON.stringify(build)],
    {
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )
  a = await serve(process.execPath, entry)
  b = await serve(process.execPath, entry)
  await new Promise<void>((resolve) => {
    gateway.listen(0, '127.0.0.1', resolve)
  })
  address = 'http://127.0.0.1:' + (gateway.address() as { port: number }).port
  browser = await chromium.launch(
    process.env.KERF_CHROME ? { executablePath: process.env.KERF_CHROME } : {},
  )
}, 120_000)

afterAll(async () => {
  await browser?.close()
  gateway.close()
  a?.stop()
  b?.stop()
  await rm(output, { recursive: true, force: true })
})

const diagnostics = new WeakMap<Page, string[]>()

async function open() {
  const page = await browser.newPage()
  page.setDefaultTimeout(8_000)
  await page.addInitScript(() => {
    sessionStorage.peer ??= 'a'
  })
  const logs: string[] = []
  diagnostics.set(page, logs)
  page.on('pageerror', (error) => logs.push(error.stack ?? error.message))
  page.on('requestfailed', (request) =>
    logs.push(request.url() + ' ' + request.failure()?.errorText),
  )
  page.on('response', (response) => {
    if (response.status() >= 400) logs.push(response.url() + ' ' + response.status())
  })
  const documents: string[] = []
  page.on('response', (r) => {
    if (r.request().resourceType() === 'document') documents.push(r.url())
  })
  return { page, documents }
}

async function go(page: Page, path: string, name: string) {
  await page.goto(address + path, { waitUntil: 'domcontentloaded' })
  try {
    await page.getByRole('heading', { name, exact: true }).waitFor()
  } catch (error) {
    throw new Error(
      `Expected ${name} at ${path}. DOM: ${await page.locator('body').textContent()}. Browser: ${(diagnostics.get(page) ?? []).join(' | ')}`,
      { cause: error },
    )
  }
}

const assertNoMarkup = async (page: Page) => {
  expect(await page.locator('#peer-markup').count()).toBe(0)
  expect(await page.evaluate(() => Reflect.get(window, 'peerExecuted'))).toBeUndefined()
  expect(await page.locator('#kerf-route, #kerf-cache, #kerf-data, [wk]').count()).toBe(0)
}

test('first load, soft navigation and both history directions render the release across two peers', async () => {
  const { page, documents } = await open()
  const from = captured.length
  try {
    const shell = await readFile(join(output, 'public/kerf-shell.html'), 'utf8')
    expect(shell).toContain('<div id="app"></div>')
    expect(shell).toContain('<link rel="stylesheet"')
    expect(shell).not.toMatch(/<h1|kerf-(route|data|cache)|\s+w[kb]=/)
    expect((await readdir(join(output, 'public'))).filter((f) => f.endsWith('.html'))).toEqual([
      'kerf-shell.html',
    ])
    for (const peer of [a, b]) {
      for (const path of ['/', '/items/42', '/broken', '/alias']) {
        const response = await fetch(peer.url + path)
        expect(response.status).toBe(404)
        expect(await response.text()).toBe('')
      }
    }

    await go(page, '/items/42', 'Peer A item 42')
    await page.getByText('Waiting for detail').waitFor()
    await page.getByText('Deferred detail 42').waitFor()
    expect(await page.title()).toBe('Peer A item 42 | Release')
    expect(await page.locator('meta[name=description]').getAttribute('content')).toBe(
      'From the release',
    )
    expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain(
      'Peer A item',
    )
    const layout = await page.getByRole('button', { name: 'Counter 0' }).elementHandle()
    await layout.click()
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
    })
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0)
    await page.goBack()
    await page.getByRole('heading', { name: 'Peer B item 42' }).waitFor()
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(await layout.textContent()).toBe('Counter 1')
    expect(documents).toEqual([address + '/items/42'])

    for (const [peer, name] of [
      ['a', 'Peer A item'],
      ['b', 'Peer B item'],
    ] as const) {
      const response = captured
        .slice(from)
        .find((r) => r.peer === peer && r.path === '/_kerf/data/items/42')!
      expect(response.headers.get('content-type')).toBe('application/x-ndjson')
      const raw = await response.text
      expect(raw).not.toMatch(/<|\b(?:head|html|params|path|cache|markup)\b/)
      const [first, detail] = raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(first).toEqual({
        v: 1,
        build: expect.any(String),
        kind: 'page',
        values: [null, { name, link: '/docs/example' }],
      })
      expect(detail).toEqual({
        kind: 'deferred',
        depth: 1,
        key: 'detail',
        value: { text: 'Deferred detail 42' },
      })
    }
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

test('redirects, errors, missing paths and decoded splats are reconstructed locally', async () => {
  const { page, documents } = await open()
  const from = captured.length
  try {
    await go(page, '/alias', 'Peer A item 42')
    expect(page.url()).toBe(address + '/items/42')
    const alias = captured.slice(from).find((r) => r.path.endsWith('/alias'))!
    expect(alias.headers.get('location')).toBeNull()
    expect(JSON.parse(await alias.text)).toEqual({
      v: 1,
      build: expect.any(String),
      kind: 'redirect',
      id: 'item',
    })
    await page.getByRole('link', { name: 'Broken' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(await page.title()).toBe('Release error | Release')
    expect(await page.locator('[data-reference]').getAttribute('data-reference')).toMatch(
      /^[a-f0-9]{24}$/,
    )
    const failed = captured.slice(from).find((r) => r.path.endsWith('/broken'))!
    expect(JSON.parse(await failed.text)).toEqual({
      v: 1,
      build: expect.any(String),
      kind: 'error',
      values: [null],
      reference: expect.stringMatching(/^[a-f0-9]{24}$/),
    })
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/broken')),
      page.getByRole('button', { name: 'Try again' }).click(),
    ])
    await page.getByRole('link', { name: 'Missing' }).click()
    await page.getByRole('heading', { name: 'Release not found /missing' }).waitFor()
    expect(documents).toEqual([address + '/alias'])
    await go(page, '/items/none', 'Release not found /items/none')
    await go(page, '/docs/part/extra%20words', 'Document part/extra words')
  } finally {
    await page.close()
  }
})

test('malicious peer frames, redirect targets, error text and untyped values fail closed', async () => {
  const { page } = await open()
  await page.addInitScript(() => {
    sessionStorage.peer = 'b'
  })
  const attacks = [
    'html',
    'transport-redirect',
    'legacy',
    'head',
    'raw',
    'version',
    'build',
    'params',
    'field',
    'type',
    'url',
    'oversize',
    'redirect-url',
    'redirect-id',
    'error-message',
  ]
  try {
    for (const attack of attacks) {
      const route = attack.startsWith('redirect-')
        ? '/alias'
        : attack === 'error-message'
          ? '/broken'
          : '/items/42'
      const path = route + '?attack=' + attack
      await go(page, path, 'Release error')
      expect(page.url()).toBe(address + path)
      expect(await page.locator('body').textContent()).not.toContain('Peer injection')
      await assertNoMarkup(page)
    }
  } finally {
    await page.close()
  }
})

test('a peer can neither inject markup during soft navigation nor when returning through history', async () => {
  const { page, documents } = await open()
  try {
    await go(page, '/items/42', 'Peer A item 42')
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.evaluate(() => {
      sessionStorage.peer = 'b'
      sessionStorage.attack = 'head'
    })
    await page.goBack()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    await assertNoMarkup(page)
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Item' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    await assertNoMarkup(page)
    expect(documents).toEqual([address + '/items/42'])
  } finally {
    await page.close()
  }
})

test('invalid deferred frames stay in the local Boundary and typed text stays literal', async () => {
  const { page } = await open()
  await page.addInitScript(() => {
    sessionStorage.peer = 'b'
  })
  try {
    for (const attack of ['deferred', 'truncated']) {
      await go(page, '/items/42?attack=' + attack, 'Peer B item 42')
      await page.getByText('Detail unavailable').waitFor()
      await assertNoMarkup(page)
    }
    await page.goto(address + '/items/42?attack=text')
    expect(await page.getByRole('heading').textContent()).toContain('<b id="peer-markup">')
    await assertNoMarkup(page)
  } finally {
    await page.close()
  }
})

async function watchSinks(page: Page) {
  await page.addInitScript((marker) => {
    const hits: string[] = []
    Reflect.set(window, 'criticSinks', hits)
    const inspect = (name: string, values: unknown[]) => {
      if (values.some((value) => String(value).includes(marker))) hits.push(name)
    }
    const watch = (owner: object, name: string) => {
      const original = Reflect.get(owner, name)
      Reflect.set(
        owner,
        name,
        new Proxy(original, {
          apply(target, self, args: unknown[]) {
            if (
              name !== 'setAttribute' ||
              /^(?:on|href|src|style|action|formaction)/i.test(String(args[0]))
            )
              inspect(name, args)
            return Reflect.apply(target, self, args)
          },
          construct(target, args: unknown[]) {
            inspect(name, args)
            return Reflect.construct(target, args)
          },
        }),
      )
    }
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!
    Object.defineProperty(Element.prototype, 'innerHTML', {
      ...original,
      set(this: Element, value: string) {
        inspect('innerHTML', [value])
        original.set!.call(this, value)
      },
    })
    watch(Element.prototype, 'insertAdjacentHTML')
    watch(Element.prototype, 'setAttribute')
    watch(DOMParser.prototype, 'parseFromString')
    watch(Document.prototype, 'write')
    watch(window, 'eval')
    watch(window, 'Function')
  }, criticMarker)
}

test('route Fetch ignores peer presentation headers and refuses to read or write cookies', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  const marker = `<span id="${criticMarker}">probe</span>`
  const from = criticCookieRead.length
  try {
    await page.context().addCookies([{ name: 'critic-release', value: 'example', url: address }])
    await watchSinks(page)
    await go(page, '/critic?critic=headers', marker)
    expect(await page.title()).toBe(marker + ' | Release')
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(await page.locator('meta[name=critic-note]').getAttribute('id')).toBeNull()
    expect(await page.locator('meta[name=critic-note]').getAttribute('content')).toBe(
      'Text content',
    )
    expect(await page.locator('link[href="/critic-hint.css"]').count()).toBe(0)
    expect(await page.locator('script[type="application/ld+json"]').textContent()).toBe(
      JSON.stringify({ label: marker }),
    )
    expect(criticCookieRead.slice(from)).toEqual([undefined])
    expect((await page.context().cookies()).map(({ name }) => name)).toEqual(['critic-release'])
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    expect(documents).toEqual([address + '/critic?critic=headers'])
    expect(requests).not.toContain('/critic-header-target')
    expect(requests).not.toContain('/critic-hint.css')
    expect(await page.evaluate(() => Reflect.get(window, 'criticSinks'))).toEqual([])
  } finally {
    await page.close()
  }
})

test('peer hydration, island and preload fields do not reach shell DOM sinks', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  try {
    await watchSinks(page)
    await go(page, '/critic?critic=legacy', 'Release error')
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(await page.evaluate(() => Reflect.get(window, 'criticSinks'))).toEqual([])
    expect(await page.title()).toBe('Release error | Release')
    expect(documents).toEqual([address + '/critic?critic=legacy'])
    expect(requests).not.toContain('/critic-hint.css')
    expect(requests).not.toContain('/@vite/client')
  } finally {
    await page.close()
  }
})

test('a peer envelope is rejected after Back and a link click with release code already loaded', async () => {
  const { page, documents } = await open()
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  try {
    await go(page, '/critic', 'Release text')
    await page.getByRole('link', { name: 'Home' }).click()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Critic' }).focus()
    expect(requests.filter((url) => url.endsWith('/_kerf/data/critic'))).toHaveLength(1)
    await page.route('**/peers/a/_kerf/data/critic', (request) =>
      request.continue({ url: request.request().url() + '?critic=legacy' }),
    )
    await page.goBack()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(page.url()).toBe(address + '/critic')
    await page.goForward()
    await page.getByRole('heading', { name: 'Release home' }).waitFor()
    await page.getByRole('link', { name: 'Critic' }).click()
    await page.getByRole('heading', { name: 'Release error' }).waitFor()
    expect(await page.locator('#' + criticMarker).count()).toBe(0)
    expect(documents).toEqual([address + '/critic'])
  } finally {
    await page.close()
  }
})

test('an untyped deferred property produces only the release Boundary fallback', async () => {
  const { page } = await open()
  try {
    await go(page, '/items/42?critic=deferred', 'Peer A item 42')
    await page.getByText('Detail unavailable').waitFor()
    expect(await page.getByText(criticMarker).count()).toBe(0)
  } finally {
    await page.close()
  }
})

test('legacy RPC, enhanced forms and realtime have no peer browser transport in shell builds', async () => {
  const { page, documents } = await open()
  const remote: string[] = []
  const log = (href: string) => {
    const path = new URL(href).pathname
    if (/\/_kerf\/(?:fn\/|rt$|ws$)/.test(path)) remote.push(path)
  }
  page.on('request', (request) => log(request.url()))
  page.on('websocket', (socket) => log(socket.url()))
  try {
    await go(page, '/critic', 'Release text')
    await page.getByRole('button', { name: 'Read server function' }).click()
    await page.getByText('Query unavailable').waitFor()
    await page.getByRole('button', { name: 'Submit server form' }).click()
    await page.getByText('Browser server functions are unavailable in shell mode.').waitFor()
    await page.getByText('offline Release stream value').waitFor()
    expect(await page.locator('[data-channel]').textContent()).toBe('unavailable')
    expect(await page.locator('[data-shared]').textContent()).toBe(
      'unavailable Release shared value',
    )
    expect(documents).toEqual([address + '/critic'])
    expect(remote).toEqual([])
    const noJs = await fetch(a.url + '/critic', {
      method: 'POST',
      body: new URLSearchParams({ $fn: 'probeMutation' }),
      redirect: 'manual',
    })
    expect(noJs.status).toBe(405)
    expect(noJs.headers.get('location')).toBeNull()
  } finally {
    await page.close()
  }
})
