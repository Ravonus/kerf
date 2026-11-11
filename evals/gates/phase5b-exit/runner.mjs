import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'

export function buildRunner(ctx, runtime, ...more) {
  const { must, kerf, dir } = ctx
  const t = performance.now()
  must(kerf(), ['build', '--runtime', runtime, ...more], dir, { NODE_ENV: 'production' })
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

export async function startRunner(
  ctx,
  runtime,
  command = [ctx.kerf(), 'start', '--runtime', runtime],
) {
  const { freePort, dir, until, sleep } = ctx
  const port = await freePort()
  const child = spawn(command[0], command.slice(1), {
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

export const linkRunner = (_ctx, id, input) =>
  `/_kerf/fn/${id}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`
export const callRunner = async (ctx, url, id, input) => {
  const { link } = ctx
  const r = await fetch(`${url}${link(id, input)}`)
  return { status: r.status, body: await r.json() }
}

/** What the server answers, for comparing builds. A checksum covers every byte of the thumbnail. */
export async function wireRunner(ctx, url) {
  const { call, ID } = ctx
  const out = {}
  for (const input of [
    { seed: 1 },
    { seed: 2, width: 333, height: 257, passes: 1, factor: 3 },
    { seed: 999, width: 64, height: 64, passes: 16, factor: 32 },
    { seed: 41, width: 1000, height: 90, passes: 2, factor: 7 },
  ])
    out[`thumb:${JSON.stringify(input)}`] = await call(url, ID.thumbnail, input)
  out.invalid = await call(url, ID.thumbnail, { seed: -1 })
  out.fits = await call(url, ID.guarded, { width: 100, height: 100 })
  out.large = await call(url, ID.guarded, { width: 100_000, height: 100_000 })
  out.stats = await call(url, ID.stats)
  // The one difference a crate chose: it adds a tag, which a later check reads.
  out.stats.body.t = out.stats.body.t.filter((x) => x !== 'images:all')
  if (out.invalid.body.e?.message)
    out.invalid.body.e.message = out.invalid.body.e.message.replace(/\n.*/s, '')
  return out
}

export async function browserRunRunner(ctx, url) {
  const { values, repo } = ctx
  if (!values.browser) return undefined
  const { chromium } = createRequire(join(repo, 'packages/start/package.json'))('playwright-core')
  const browser = await chromium.launch()
  const seen = []
  try {
    const page = await (await browser.newContext({ baseURL: url })).newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
      if (r.url().includes('/_kerf/fn/')) seen.push(new URL(r.url()).pathname)
    })
    await page.goto('/thumb')
    await page.waitForLoadState('networkidle')
    const sum = () => page.locator('output.sum').textContent()
    const first = await sum()
    const hydrated = seen.length
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForFunction(
      (old) => document.querySelector('output.sum')?.textContent !== old,
      first,
    )
    const second = await sum()
    await page.getByRole('button', { name: 'Open' }).click()
    await page.locator('p.failed', { hasText: 'TooLarge' }).waitFor({ timeout: 5000 })
    return { first, second, hydrated, failed: await page.locator('p.failed').textContent(), errors }
  } finally {
    await browser.close()
  }
}

/** Sequential calls, then 32 at once, against a running build. The server's own overhead is in both. */
export async function benchRunner(ctx, url) {
  const { link, ID } = ctx
  const at = (i) => `${url}${link(ID.thumbnail, { seed: 100 + (i % 7) })}`
  const one = (i) => fetch(at(i)).then((r) => r.text())
  for (let i = 0; i < 30; i++) await one(i)
  const times = []
  for (let i = 0; i < 100; i++) {
    const t = performance.now()
    await one(i)
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const t = performance.now()
  let n = 0
  await Promise.all(
    Array.from({ length: 32 }, async (_, w) => {
      for (let i = 0; i < 4; i++) {
        await one(i + w)
        n++
      }
    }),
  )
  return {
    p50: +times[50].toFixed(2),
    p99: +times[98].toFixed(2),
    perSecond: +(n / ((performance.now() - t) / 1000)).toFixed(1),
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
    out.html = await (await fetch(`${s.url}/thumb`)).text()
    out.wire = await wire(s.url)
    out.browser = await browserRun(s.url)
    out.bench = await bench(s.url)
    results[name][runtime] = out
  } catch (e) {
    throw new Error(`${e.message}\n--- server\n${s.output().slice(-3000)}`, { cause: e })
  } finally {
    await s.stop()
  }
}
