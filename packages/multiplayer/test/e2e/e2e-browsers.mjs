#!/usr/bin/env node
import { freePort, repoRoot, sleep } from '../../../../scripts/lib/helpers.mjs'
// Two browsers, one document (research 35 §6): a real app, built for each runtime, served on it, and driven by two
// Chromium contexts with different users and window sizes. With `--bus redis` or `nats` each browser talks to its own
// instance, so everything also has to cross the bus. `--via` runs cursors over a transport pack.
//
//   node packages/multiplayer/test/e2e/e2e-browsers.mjs prepare <dir> [--tarballs <dir>]
//   node packages/multiplayer/test/e2e/e2e-browsers.mjs run <dir> [--runtimes node,bun,deno] [--bus memory,redis] [--via webrtc]
//
// `--redis <bin>`, `--nats <bin>`: run a throwaway server. `REDIS_URL`/`NATS_URL` use yours. `LIVEKIT_URL` with
// `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` enables `--via livekit`.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { pin, writePackedPolicy } from '../../../create/scripts/tarballs.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = repoRoot
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runtimes: { type: 'string', default: 'node,bun,deno' },
    bus: { type: 'string', default: 'memory' },
    via: { type: 'string', default: '' },
    redis: { type: 'string', default: 'redis-server' },
    nats: { type: 'string', default: 'nats-server' },
    tarballs: { type: 'string' },
  },
})
const [command, target] = positionals
const app = resolve(target)
const LINKED = [
  '@weft-js/core',
  '@weft-js/start',
  '@weft-js/cli',
  '@weft-js/multiplayer',
  '@weft-js/realtime-redis',
  '@weft-js/realtime-nats',
  '@weft-js/realtime-webrtc',
  '@weft-js/realtime-socketio',
  '@weft-js/realtime-livekit',
]

function must(cmd, args, cwd = app, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

/** Which plugins the app lists, as `weft add` would leave them. A bus is one line here, so that is the line tested. */
function configure(bus) {
  const list = { redis: 'redis()', nats: 'nats()' }[bus]
  const imports =
    {
      redis: "import redis from '@weft-js/realtime-redis/plugin'\n",
      nats: "import nats from '@weft-js/realtime-nats/plugin'\n",
    }[bus] ?? ''
  writeFileSync(
    join(app, 'weft.config.ts'),
    `import { defineConfig } from '@weft-js/core/config'\n${imports}\nexport default defineConfig({\n  site: { name: 'Room', title: '%s · Room', description: 'Two browsers.' },\n  plugins: [${list ?? ''}],\n})\n`,
  )
  must(join(app, 'node_modules/.bin/weft'), ['plugins', 'sync'])
  must(join(app, 'node_modules/.bin/weft'), ['plugins', 'approve', '--all'])
}

if (command === 'prepare') {
  must(
    'node',
    [
      join(repo, 'packages/create/bin/create-weft.mjs'),
      app,
      '--db',
      'none',
      '--ui',
      'none',
      '--name',
      'room',
    ],
    repo,
  )
  const file = join(app, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  delete pkg.devDependencies?.['@weft-js/cli']
  const where = (name) => `file:${join(repo, 'packages', name.replace('@weft-js/', ''))}`
  const tarballs =
    values.tarballs && JSON.parse(readFileSync(join(values.tarballs, 'tarballs.json'), 'utf8'))
  for (const name of LINKED) pkg.dependencies[name] = tarballs?.[name] ?? where(name)
  pkg.dependencies['socket.io-client'] = '4.8.4'
  pkg.dependencies['livekit-client'] = '2.23.0'
  writeFileSync(file, JSON.stringify(tarballs ? pin(pkg, tarballs) : pkg, null, 2) + '\n')
  cpSync(join(here, '../../fixture/src'), join(app, 'src'), { recursive: true })
  writePackedPolicy(app, tarballs)
  must('pnpm', ['install', '--no-frozen-lockfile'])
  configure('memory')
  console.log(`prepared ${app}`)
  process.exit(0)
}

const SERVERS = {
  node: ['node', ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs']],
  bun: ['bun', ['run', '.output/server/index.mjs']],
  deno: ['deno', ['run', '-A', '.output/server/index.mjs']],
}
const kids = new Set()
const start = (cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: process.env.DEBUG_E2E ? 'inherit' : 'ignore', ...opts })
  kids.add(c)
  return c
}
const stopAll = (from = new Set()) => {
  for (const k of kids)
    if (!from.has(k)) {
      k.kill('SIGKILL')
      kids.delete(k)
    }
}

async function instance(runtime, env) {
  const port = await freePort()
  const [cmd, args] = SERVERS[runtime]
  start(cmd, args, {
    cwd: app,
    env: { ...process.env, ...env, PORT: String(port), NODE_ENV: 'production' },
  })
  const url = `http://localhost:${port}`
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(`${url}/room`, { redirect: 'manual' })
      return url
    } catch {
      await sleep(100)
    }
  }
  throw new Error(`${runtime} on ${port} did not answer`)
}

const { chromium } = createRequire(join(repo, 'packages/multiplayer/package.json'))(
  'playwright-core',
)

async function user(browser, url, name, viewport, via) {
  const context = await browser.newContext({ viewport })
  await context.addCookies([{ name: 'who', value: name, url }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${url}/room${via ? `?via=${via}` : ''}`)
  await page.getByLabel('status').filter({ hasText: 'open' }).waitFor({ timeout: 15_000 })
  return { page, context, errors }
}

const has = (page, label, text) =>
  page.getByLabel(label, { exact: true }).filter({ hasText: text }).waitFor({ timeout: 10_000 })
const peers = (page, name) =>
  page.getByLabel('peers').getByRole('listitem').filter({ hasText: name })

async function scenario(browser, urlA, urlB, via, log) {
  const checks = []
  const check = checkRecorder(checks, log)
  const a = await user(browser, urlA, 'ana', { width: 1280, height: 800 }, via)
  const b = await user(browser, urlB, 'kofi', { width: 800, height: 600 }, via)
  await peers(a.page, 'kofi').waitFor({ timeout: 10_000 })
  await peers(b.page, 'ana').waitFor({ timeout: 10_000 })
  check('each browser sees the other, by the name the server gave', true)
  check('a browser is not its own peer', (await peers(a.page, 'ana').count()) === 0)

  await a.page.getByLabel('typing').check()
  await peers(b.page, 'ana typing').waitFor({ timeout: 5000 })
  check('state reaches the other browser', true)

  await a.page.getByLabel('title').fill('hello from ana')
  await b.page.waitForFunction(
    () => document.querySelector('[aria-label=title]').value === 'hello from ana',
    null,
    { timeout: 5000 },
  )
  await b.page.getByLabel('title').fill('and kofi')
  await a.page.waitForFunction(
    () => document.querySelector('[aria-label=title]').value === 'and kofi',
    null,
    { timeout: 5000 },
  )
  check('shared state goes both ways', true)

  await b.page.getByRole('button', { name: 'note' }).click()
  await has(a.page, 'notes', 'saved')
  check("the room's own messages still work beside it", true)

  await a.page.getByRole('button', { name: 'ping' }).click()
  await has(b.page, 'pinged', 'card from a peer')
  check('a relay event reaches a typed handler', true)

  if (via) {
    await a.page.getByLabel('via').filter({ hasText: via }).waitFor({ timeout: 20_000 })
    await b.page.getByLabel('via').filter({ hasText: via }).waitFor({ timeout: 20_000 })
    check(`cursors are going over ${via}`, true)
    await a.page.evaluate(trackCursorFrames)
  }

  // Three quarters across and halfway down the board, on two boards of different sizes.
  const box = await a.page.getByLabel('board').boundingBox()
  await a.page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5)
  await a.page.mouse.move(box.x + box.width * 0.75 + 1, box.y + box.height * 0.5)
  const seen = b.page.locator('[data-part=cursor]')
  await seen.waitFor({ state: 'attached', timeout: 5000 })
  await sleep(300)
  const other = await b.page.getByLabel('board').boundingBox()
  const at = await seen.evaluate(cursorPosition)
  checkCursorPlacement(at, other, check)
  if (via)
    check(
      'none of those frames went through the server',
      (await a.page.evaluate(() => window.__sent)) === 0,
    )

  await b.context.setOffline(true)
  await peers(a.page, 'kofi').waitFor({ state: 'detached', timeout: 30_000 })
  await b.context.setOffline(false)
  await peers(a.page, 'kofi').waitFor({ timeout: 30_000 })
  await peers(b.page, 'ana').waitFor({ timeout: 10_000 })
  check('a dropped browser leaves, and comes back', true)

  await a.context.close()
  await peers(b.page, 'ana').waitFor({ state: 'detached', timeout: 10_000 })
  check('a closed browser leaves at once', true)

  await b.page.waitForFunction(() => !document.querySelector('[data-part=cursor]'), null, {
    timeout: 5000,
  })
  check('its cursor goes with it', true)
  if (b.errors.length || a.errors.length)
    throw new Error(`page errors: ${[...a.errors, ...b.errors].join('; ')}`)
  await b.context.close()
  return checks
}

function checkRecorder(checks, log) {
  return (name, ok, detail) => {
    if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`)
    checks.push(name)
    log(`ok ${name}`)
  }
}

function trackCursorFrames() {
  window.__sent = 0
  // oxlint-disable typescript/unbound-method -- wrapping a prototype method: `s.call(this, t)` gives it its `this` back
  const s = WebSocket.prototype.send /* oxlint-enable typescript/unbound-method */
  WebSocket.prototype.send = function (t) {
    if (typeof t === 'string' && t.includes('mp.cursor')) window.__sent++
    return s.call(this, t)
  }
}

function cursorPosition(el) {
  const m = new DOMMatrix(getComputedStyle(el).transform)
  return { x: m.e, y: m.f }
}

function checkCursorPlacement(at, other, check) {
  const dx = at.x - (other.x + other.width * 0.75),
    dy = at.y - (other.y + other.height * 0.5)
  check(
    'a cursor lands on the same spot of an anchor on another screen',
    Math.abs(dx) < 8 && Math.abs(dy) < 8,
    { dx, dy },
  )
}

let failed = false
const runtimes = values.runtimes.split(','),
  buses = values.bus.split(','),
  routes = values.via ? values.via.split(',') : ['']
const redisPort = await freePort(),
  natsPort = await freePort()
const relayPort = await freePort(),
  secret = randomBytes(16).toString('hex')
const env = {
  redis: { REDIS_URL: process.env.REDIS_URL ?? `redis://127.0.0.1:${redisPort}` },
  nats: { NATS_URL: process.env.NATS_URL ?? `127.0.0.1:${natsPort}` },
  memory: {},
}
if (buses.includes('redis') && !process.env.REDIS_URL)
  start(values.redis, ['--port', String(redisPort), '--save', '', '--appendonly', 'no'])
if (buses.includes('nats') && !process.env.NATS_URL) start(values.nats, ['-p', String(natsPort)])

let extra = {}
if (routes.includes('socketio')) {
  start(
    'node',
    [
      '--input-type=module',
      '-e',
      `
    import { createServer } from 'node:http'
    import { createRequire } from 'node:module'
    const require = createRequire(${JSON.stringify(join(repo, 'packages/realtime-socketio/package.json'))})
    const { Server } = require('socket.io')
    const { createHmac, timingSafeEqual } = await import('node:crypto')
    const http = createServer()
    const io = new Server(http, { cors: { origin: true } })
    const verify = t => { const [h, b, s] = String(t).split('.'); if (!s) return null; const want = createHmac('sha256', process.env.SECRET).update(h + '.' + b).digest('base64url'); if (want.length !== s.length || !timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null; return JSON.parse(Buffer.from(b, 'base64url')) }
    io.use((s, next) => { const c = verify(s.handshake.auth?.ticket); if (!c?.sub) return next(new Error('bad ticket')); s.data = { peer: c.sub, room: c.room }; next() })
    io.on('connection', async s => { await s.join(s.data.room); s.emit('weft:ok'); s.on('weft:f', t => s.to(s.data.room).volatile.emit('weft:f', s.data.peer, t)) })
    http.listen(${relayPort})
  `,
    ],
    { env: { ...process.env, SECRET: secret } },
  )
  extra = {
    WEFT_E2E_SOCKETIO_SECRET: secret,
    WEFT_E2E_SOCKETIO_URL: `http://127.0.0.1:${relayPort}`,
  }
  await sleep(500)
}
await sleep(500)

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'],
})
try {
  for (const bus of buses) {
    configure(bus)
    for (const runtime of runtimes) {
      must(join(app, 'node_modules/.bin/weft'), ['build', '--runtime', runtime], app, {
        ...process.env,
        NODE_ENV: 'production',
        ...env[bus],
        ...extra,
      })
      for (const via of routes) {
        const live = new Set(kids)
        const name = `${runtime} ${bus}${via ? ` via ${via}` : ''}`
        try {
          const shared = { ...env[bus], ...extra }
          const urlA = await instance(runtime, shared)
          const urlB = bus === 'memory' ? urlA : await instance(runtime, shared)
          const checks = await scenario(
            browser,
            urlA,
            urlB,
            via,
            (text) => process.env.DEBUG_E2E && console.log(`  ${text}`),
          )
          console.log(`[browsers] ${name}: ${checks.length} checks passed`)
        } catch (e) {
          failed = true
          console.log(`[browsers] ${name}: FAIL ${e.message}`)
        }
        stopAll(live)
      }
    }
  }
} finally {
  await browser.close()
  stopAll()
}
process.exit(failed ? 1 : 0)
