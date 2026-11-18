// A production build runs on two peers while a separate origin serves only release artifacts.
import { execFile } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { chromium, type Browser, type Page } from 'playwright-core'
import { serve } from './build.setup'
import { destinations } from './fixtures/shell/src/redirects'

const root = join(import.meta.dirname, 'fixtures/shell')
const output = join(root, '.output-browser-shell')
const entry = join(output, 'server/index.mjs')
const build = {
  root,
  preset: 'node',
  logLevel: 'error',
  site: {
    render: 'shell',
    routeRedirects: destinations,
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
  const peer = /^\/peers\/(a|b)(\/_kerf\/(?:data\/.*|fn\/.+|rt|bootstrap))$/.exec(url.pathname)
  if (peer && url.searchParams.has('critic')) criticCookieRead.push(req.headers.cookie)
  const task = peer
    ? forward(peer[1]!, peer[2]! + url.search, req, res)
    : releaseFile(url.pathname, res)
  void task.catch(() => {
    if (!res.headersSent) res.writeHead(404)
    res.end()
  })
})

const privateMarkup = '<span id="peer-markup">PEER_PRIVATE_ERROR</span>'
const operationAttacks = ['field', 'html', 'type', 'oversize', 'build', 'error'] as const

function tamper(frame: { build: string; kind: string; value: unknown }, attack: string) {
  const { kind } = frame
  if (attack === 'html') return privateMarkup
  if (attack === 'build') return JSON.stringify({ ...frame, build: 'different-release' })
  const write = (value: unknown) => JSON.stringify({ ...frame, value })
  if (attack === 'error') {
    const value = { code: 'failed', message: privateMarkup }
    if (kind === 'sse:m')
      return JSON.stringify({
        ...frame,
        kind: 'sse:e',
        value: [(frame.value as unknown[])[0], value],
      })
    if (kind === 'channel') return write(['e', (frame.value as unknown[])[1], value])
    return write(value)
  }
  const text =
    attack === 'type'
      ? { text: privateMarkup }
      : attack === 'oversize'
        ? privateMarkup.repeat(2_000)
        : privateMarkup
  const result = { text, ...(attack === 'field' && { extra: privateMarkup }) }
  if (kind === 'sse:m' || kind === 'channel') {
    const row = frame.value as unknown[]
    return write([...row.slice(0, -1), result])
  }
  if (kind === 'bootstrap')
    return write({ peer: text, ...(attack === 'field' && { extra: privateMarkup }) })
  return write({ v: result, t: [] })
}

async function forward(peer: string, path: string, req: IncomingMessage, res: ServerResponse) {
  const body: Buffer[] = []
  if (req.method === 'POST') for await (const chunk of req) body.push(Buffer.from(chunk))

  const headers = new Headers({ 'x-fixture-peer': peer, 'accept-encoding': 'identity' })
  for (const name of ['x-kerf', 'content-type'])
    if (req.headers[name]) headers.set(name, String(req.headers[name]))
  const signal = new AbortController()
  if (path.startsWith('/_kerf/rt')) res.on('close', () => signal.abort())
  const response = await fetch((peer === 'a' ? a : b).url + path, {
    redirect: 'manual',
    method: req.method ?? 'GET',
    headers,
    ...(req.method === 'POST' && { body: Buffer.concat(body) }),
    signal: signal.signal,
  })
  if (path.includes('?critic=')) return hostileReply(path, response, res)
  const url = new URL(path, 'http://localhost')
  const attack = url.searchParams.get('operationAttack')
  if (url.pathname === '/_kerf/rt') {
    if (attack && response.ok) return hostileEvents(response, res, attack)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) await pipeline(response.body, res)
    else res.end()
    return
  }
  if (attack) {
    const frame = JSON.parse(await response.text())
    const text = tamper(frame, attack)
    res
      .writeHead(attack === 'error' ? 500 : response.status, {
        'content-type': attack === 'html' ? 'text/html' : 'application/x-ndjson',
      })
      .end(text + '\n')
    return
  }
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) return void res.end()
  const [stream, receipt] = response.body.tee()
  const text = new Response(receipt).text()
  void text.catch(() => {})
  captured.push({ peer, path, headers: response.headers, text })
  await pipeline(stream, res)
}

async function hostileEvents(response: Response, res: ServerResponse, attack: string) {
  const body = response.body!.pipeThrough(new TextDecoderStream())
  const reader = body.getReader()
  let pending = ''
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      pending += chunk.value
      for (let end; (end = pending.indexOf('\n\n')) >= 0; pending = pending.slice(end + 2)) {
        const packet = pending.slice(0, end)
        if (!packet.startsWith('event: m\n')) {
          res.write(packet + '\n\n')
          continue
        }
        const frame = JSON.parse(packet.split('\ndata: ')[1]!)
        const event = attack === 'error' ? 'e' : 'm'
        res.end(`event: ${event}\ndata: ${tamper(frame, attack)}\n\n`)
        return
      }
    }
    res.end()
  } finally {
    await reader.cancel().catch(() => {})
  }
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
  await new Promise<void>((resolve) => {
    gateway.listen(0, '127.0.0.1', resolve)
  })
  address = 'http://127.0.0.1:' + (gateway.address() as { port: number }).port
  const env = { SHELL_FIXTURE_ORIGIN: address, NITRO_HOST: '127.0.0.1' }
  a = await serve(process.execPath, entry, env)
  b = await serve(process.execPath, entry, env)
  browser = await chromium.launch(
    process.env.KERF_CHROME ? { executablePath: process.env.KERF_CHROME } : {},
  )
}, 120_000)

afterAll(async () => {
  await browser?.close()
  gateway.closeAllConnections()
  await new Promise<void>((done) => {
    gateway.close(() => done())
  })
  a?.stop()
  b?.stop()
  await Promise.all([a?.exit, b?.exit])
  await rm(output, { recursive: true, force: true })
})

const diagnostics = new WeakMap<Page, string[]>()

async function open() {
  const page = await browser.newPage()
  page.setDefaultTimeout(8_000)
  await page.addInitScript(
    ([socketA, socketB]) => {
      sessionStorage.peer ??= 'a'
      sessionStorage.socketA = socketA
      sessionStorage.socketB = socketB
    },
    [a.url, b.url] as const,
  )
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

export {
  a,
  b,
  address,
  captured,
  criticCookieRead,
  criticMarker,
  open,
  go,
  assertNoMarkup,
  operationAttacks,
  tamper,
}

export async function watchSinks(page: Page) {
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
