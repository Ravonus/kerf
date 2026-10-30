// `weft build` (research 25 §6): Vite + Nitro to `.output`, run as the production server it makes. Node end to end
// (pages, prerendered and on-demand cards, hydration in Chrome); Bun runs its build when `bun` is on PATH; Deno's
// build is checked to complete (no deno here).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fnId } from '../src/vite.mjs'
import { fixture, site } from './dev-server.setup.mjs'

const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })
// Each build runs in its own node process, as `weft build` does: Nitro's build stalls inside vitest's module runner.
function build({ preset, ...rest }) {
  const opts = JSON.stringify({ ...rest, preset, logLevel: 'error' })
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'build-app.mjs'), opts], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } })
  if (r.status !== 0) throw new Error(`${preset} build failed:\n${r.stderr}`)
}
const out = preset => join(fixture, `.output-test-${preset}`)

async function serve(cmd, entry) {
  const port = await freePort()
  const child = spawn(cmd, [entry], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdio: 'ignore' })
  // Poll the port: Nitro's logger is silent under vitest's NODE_ENV=test, so there is no "Listening" line to wait for.
  let exited
  child.on('exit', code => (exited = code))
  for (const t0 = Date.now(); ; await new Promise(ok => setTimeout(ok, 100))) {
    if (exited !== undefined) throw new Error(`${cmd} exited with ${exited}`)
    if (Date.now() - t0 > 20_000) throw new Error(`${cmd} did not listen on ${port}`)
    if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) break
  }
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}

afterAll(() => { for (const p of ['node', 'bun', 'deno_server']) rmSync(out(p), { recursive: true, force: true }) })

describe('node preset, end to end', () => {
  let server
  beforeAll(async () => {
    await build({ root: fixture, site, preset: 'node', nitro: { output: { dir: out('node') } } })
    server = await serve(process.execPath, join(out('node'), 'server/index.mjs'))
  }, 120_000)
  afterAll(() => server?.stop())

  test('cards for static routes and `prerender` params are files in the output', () => {
    for (const f of ['index', 'about', 'users', 'slow', 'users/1']) expect(existsSync(join(out('node'), `public/_weft/og/${f}.png`))).toBe(true)
    expect(existsSync(join(out('node'), 'public/_weft/og/users/2.png'))).toBe(false) // param route without prerender: on demand
  })

  test('a page: every tag, hashed client assets, the status before the first byte', async () => {
    const res = await fetch(server.url + '/users/42')
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text.match(/ data-wm>/g)).toHaveLength(15)
    expect(text).toMatch(/<script type="module" src="\/assets\/entry\.client-[\w-]+\.js"><\/script>/)
    expect(text).not.toContain('/@vite/client')
    expect((await fetch(server.url + '/users/999')).status).toBe(404)
    expect((await fetch(server.url + '/boom')).status).toBe(500)
  })

  test('cards: prerendered and on demand, both immutable', async () => {
    const pre = await fetch(server.url + '/_weft/og/users/1.png?v=anything')
    expect([pre.status, pre.headers.get('content-type'), pre.headers.get('cache-control')]).toEqual([200, 'image/png', 'public, max-age=31536000, immutable'])
    const page = await (await fetch(server.url + '/users/2')).text()
    const src = /og:image" content="https:\/\/acme\.dev([^"]+)"/.exec(page)[1]
    const live = await fetch(server.url + src)
    expect([live.status, live.headers.get('cache-control')]).toEqual([200, 'public, max-age=31536000, immutable'])
    const stale = await fetch(server.url + '/_weft/og/users/2.png?v=old')
    expect(stale.headers.get('cache-control')).toBe('no-cache') // not the current hash: never cached as immutable
  })

  test('a form works without JS, and an upload reaches the media route', async () => {
    const id = (name, file) => fnId(name, file)
    const add = new URLSearchParams({ $fn: id('addNote', 'src/server/forms.ts'), title: 'Built', qty: '2' })
    const refused = await fetch(server.url + '/notes', { method: 'POST', redirect: 'manual', body: add })
    expect(refused.status).toBe(403) // no origin proof
    const done = await fetch(server.url + '/notes', { method: 'POST', redirect: 'manual', headers: { origin: server.url }, body: add })
    expect([done.status, done.headers.get('location')]).toEqual([303, '/notes'])
    const sharp = createRequire(new URL('../../plugin-media/package.json', import.meta.url))('sharp')
    const file = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#468' } }).png().toBuffer()
    const form = new FormData()
    form.set('$fn', id('setCover', 'src/server/forms.ts'))
    form.set('file', new File([file], 'built.png', { type: 'image/png' }))
    expect((await fetch(server.url + '/cover', { method: 'POST', redirect: 'manual', headers: { origin: server.url }, body: form })).status).toBe(303)
    const { v } = await (await fetch(`${server.url}/_weft/fn/${id('getCover', 'src/server/forms.ts')}`)).json()
    const image = await fetch(server.url + v.src, { headers: { accept: 'image/avif' } })
    expect([image.status, image.headers.get('content-type'), image.headers.get('cache-control')]).toEqual([200, 'image/avif', 'public, max-age=31536000, immutable'])
  })

  test('the production build hydrates with 0/0 in Chrome and navigates', async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(server.url + '/users/1')
      await page.waitForFunction(() => window.__weft?.hydrated)
      expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
      await page.click('a[href="/users/42"]')
      await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Alan Turing')
      expect(await page.title()).toBe('Alan Turing · Acme')
      // The client bundle carries no loader code: the fixture's db module (with its marker string) stays on the server.
      const js = await page.evaluate(() => Promise.all(performance.getEntriesByType('resource').filter(e => e.name.endsWith('.js')).map(e => fetch(e.name).then(r => r.text()))))
      expect(js.join('\n')).not.toContain('db-secret-7f3a')
    } finally {
      await browser.close()
    }
  })
})

test('bun preset builds and serves', async () => {
  await build({ root: fixture, site, preset: 'bun', nitro: { output: { dir: out('bun') } } })
  expect(existsSync(join(out('bun'), 'server/index.mjs'))).toBe(true)
  if (spawnSync('bun', ['--version']).status !== 0) return
  const server = await serve('bun', join(out('bun'), 'server/index.mjs'))
  try {
    const res = await fetch(server.url + '/users/42')
    expect(res.status).toBe(200)
    expect((await res.text()).match(/ data-wm>/g)).toHaveLength(15)
    const card = await fetch(server.url + '/_weft/og/users/2.png')
    expect(card.headers.get('content-type')).toBe('image/png')
  } finally {
    server.stop()
  }
}, 120_000)

test('deno_server preset builds', async () => {
  await build({ root: fixture, site, preset: 'deno_server', nitro: { output: { dir: out('deno_server') } } })
  const entry = readFileSync(join(out('deno_server'), 'server/index.mjs'), 'utf8')
  expect(entry).toMatch(/Deno\.serve|deno/i)
  expect(existsSync(join(out('deno_server'), 'public/_weft/og/users/1.png'))).toBe(true)
}, 120_000)
