import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export function buildRunner(ctx, runtime) {
  const { must, kerf, dir } = ctx
  const t = performance.now()
  must(kerf(), ['build', '--runtime', runtime], dir, { NODE_ENV: 'production' })
  return Math.round(performance.now() - t)
}

export function publicHashesRunner(ctx) {
  const { dir } = ctx
  const root = join(dir, '.output/public')
  const out = {}
  for (const f of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue
    const file = join(f.parentPath, f.name)
    out[relative(root, file)] = createHash('sha256')
      .update(readFileSync(file))
      .digest('hex')
      .slice(0, 16)
  }
  return out
}

export async function startRunner(ctx, runtime) {
  const { freePort, kerf, dir, until, sleep } = ctx
  const port = await freePort()
  const child = spawn(kerf(), ['start', '--runtime', runtime], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let output = ''
  child.stdout.on('data', (d) => {
    output += d
  })
  child.stderr.on('data', (d) => {
    output += d
  })
  const url = `http://localhost:${port}`
  await until(
    `${runtime} on ${port}: ${output}`,
    async () => (await fetch(`${url}/`, { redirect: 'manual' })).status > 0,
  )
  return {
    url,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM')
      } catch {}
      const done = new Promise((closed) => {
        child.on('close', closed)
      })
      await Promise.race([done, sleep(3000)])
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {}
    },
  }
}

export const callRunner = async (_ctx, url, id, input) => {
  const r = await fetch(
    `${url}/_kerf/fn/${id}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`,
  )
  return { status: r.status, body: await r.json() }
}

/** What the server answers, for comparing the two builds. No mutation: each run starts from the same index. */
export async function wireRunner(ctx, url) {
  const { call, ID } = ctx
  const out = {}
  for (const [q, limit] of [
    ['lantern', 5],
    ['compass harbor', 10],
    ['  granite  ', 3],
    ['nothingmatchesthis', 5],
    ['w1 w2 w3 w4', 50],
    ['quartz', undefined],
  ]) {
    out[`search:${q}:${limit}`] = await call(url, ID.search, { q, limit })
  }
  out.empty = await call(url, ID.search, { q: '', limit: 5 })
  out.long = await call(url, ID.search, { q: 'x'.repeat(201), limit: 5 })
  out.limit = await call(url, ID.search, { q: 'x', limit: 51 })
  out.popular = await call(url, ID.popular, { limit: 3 })
  out.get = await call(url, ID.get, { id: 'doc-7' })
  out.missing = await call(url, ID.get, { id: 'no-such-doc' })
  // The one difference a sidecar chose: it adds a tag to `getDoc`, which the Rust-only check reads.
  out.get.body.t = out.get.body.t.filter((x) => !x.startsWith('doc:'))
  for (const a of [out.missing, out.empty, out.long, out.limit])
    if (a.body.e?.message) a.body.e.message = a.body.e.message.replace(/\n.*/s, '')
  return out
}

export async function browserRunRunner(ctx, url) {
  const { chromium, ok } = ctx
  const browser = await chromium.launch()
  const seen = []
  try {
    const page = await (await browser.newContext({ baseURL: url })).newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
      if (r.url().includes('/_kerf/fn/')) seen.push(`${r.method()} ${new URL(r.url()).pathname}`)
    })
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    const hits = () => page.$$eval('ul.hits li', (l) => l.map((x) => x.textContent.trim()))
    const before = await hits()
    ok(before.length === 5, `SSR hits: ${before.length}`)
    const title = await page.title()
    const hydrated = seen.length
    await page.getByLabel('Search').fill('compass')
    await page.waitForFunction(
      (old) => document.querySelector('ul.hits li')?.textContent !== old,
      before[0],
    )
    const compass = await hits()
    const afterSearch = seen.length

    await page.getByLabel('Search').fill('zebra')
    await page.waitForFunction(() => document.querySelectorAll('ul.hits li').length === 0)
    await page.waitForLoadState('networkidle')
    const mark = seen.length
    await page.getByLabel('Title').fill('Zebra lantern')
    const posted = page.waitForResponse(
      (r) => r.url().includes('/_kerf/fn/') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Add' }).click()
    await posted
    await page
      .locator('ul.hits li', { hasText: 'Zebra lantern' })
      .first()
      .waitFor({ timeout: 5000 })
    const added = await hits()
    await page.waitForLoadState('networkidle')
    const addRequests = seen.slice(mark)

    await page.getByRole('button', { name: 'Open' }).click()
    await page.locator('output', { hasText: 'NotFound:no-such-doc' }).waitFor({ timeout: 5000 })
    return {
      title,
      hydrated,
      before,
      compass,
      afterSearch,
      added,
      addRequests,
      output: await page.locator('output').textContent(),
      errors,
    }
  } finally {
    await browser.close()
  }
}

/** Sequential calls, then 32 at once, against a running build. The server's own overhead is in both. */
export async function benchRunner(ctx, url) {
  const { ID } = ctx
  const queries = [
    'lantern',
    'compass harbor',
    'granite willow ember',
    'w1 w2 w3 w4 w5',
    'meadow',
  ].map(
    (q) => `${url}/_kerf/fn/${ID.search}?i=${encodeURIComponent(JSON.stringify({ q, limit: 20 }))}`,
  )
  const one = (u) => fetch(u).then((r) => r.text())
  for (let i = 0; i < 300; i++) await one(queries[i % 5])
  const times = []
  for (let i = 0; i < 1500; i++) {
    const t = performance.now()
    await one(queries[i % 5])
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const t = performance.now()
  let n = 0
  await Promise.all(
    Array.from({ length: 32 }, async (_, w) => {
      for (let i = 0; i < 250; i++) {
        await one(queries[(i + w) % 5])
        n++
      }
    }),
  )
  return {
    p50: +times[750].toFixed(2),
    p99: +times[1485].toFixed(2),
    perSecond: Math.round(n / ((performance.now() - t) / 1000)),
  }
}

export async function variantRunner(ctx, name, runtime, results) {
  const { log, build, publicHashes, start, wire, browserRun, bench } = ctx
  log(`${name} on ${runtime}: build`)
  const buildMs = build(runtime)
  const hashes = publicHashes()
  const s = await start(runtime)
  try {
    const out = { buildMs, hashes }
    out.html = await (await fetch(`${s.url}/search`)).text()
    out.wire = await wire(s.url)
    out.browser = await browserRun(s.url)
    out.bench = await bench(s.url)
    results[name][runtime] = out
    return s.output()
  } catch (e) {
    throw new Error(`${e.message}\n--- server\n${s.output().slice(-3000)}`, { cause: e })
  } finally {
    await s.stop()
  }
}
