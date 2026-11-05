#!/usr/bin/env node
import { freePort, sleep, repoRoot } from '../../scripts/lib/helpers.mjs'
// Phase 5b's exit check (PLAN §9, "5b. Rust: native"; research 39): a CPU-bound demo beats its TS `run` by at least 5× on
// Node and Bun. The same app is built twice. Before: `thumbnail` is a TS `run`, written with typed arrays as a careful
// author writes it. After: it's `impl: media`, and a crate does the same arithmetic, which this script holds it to:
//
//   client   `.output/public` is byte-identical, `/thumb` serves byte-identical HTML, and the same e2e passes
//   wire     the same requests get the same answers, checksums of every output byte included
//   speed    p50 through the public GET, then 32 callers at once, at ≥ 5× on the first two runtimes
//
// then what only native() has: the WASM fallback with the addon gone, the event loop staying free, a pool as big as the
// machine, a panic, a deadline, a stale library, R103–R105, `weft dev` reloading in place, `weft add rust` from nothing,
// and a build with no `native()` carrying none of it. Each `weft start` runs on Node, Bun and Deno. The swap is scripted.
//
//   node evals/gates/phase5b-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--no-browser] [--results phase5b-exit]
//
// Writes evals/results/<results>.md and .json; exit 1 if any check fails. Needs cargo with Rust 1.99, bun and deno for those
// runtimes, packages/core's native compiler built, and each package's dependencies installed.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { loadavg } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { commands, until, eq, makeCheck, localPackages, writeJson } from '../lib/gate.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = repoRoot
const packageUrl = localPackages(repo)
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runtimes: { type: 'string', default: 'node,bun,deno' },
    browser: { type: 'boolean', default: true },
    results: { type: 'string', default: 'phase5b-exit' },
  },
})
if (!positionals[0]) {
  console.error(
    'usage: phase5b-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--no-browser] [--results name]',
  )
  process.exit(1)
}
const dir = resolve(positionals[0])
if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`)
const runtimes = values.runtimes.split(',')
const { fnId } = await import(join(repo, 'packages/start/src/vite.mjs'))

const log = (...a) => console.log('[5b]', ...a)
const { run, must } = commands(dir, 1 << 28, true)
const weft = () => join(dir, 'node_modules/.bin/weft')
const ID = Object.fromEntries(
  ['thumbnail', 'guarded', 'stats', 'boom', 'spin'].map((n) => [n, fnId(n, 'src/server/thumb.ts')]),
)
const REQUIRED = 5

const checks = []
const ok = (v, what) => {
  if (!v) throw new Error(what)
}
const check = makeCheck(checks, log, 140)

function build(runtime, ...more) {
  const t = performance.now()
  must(weft(), ['build', '--runtime', runtime, ...more], dir, { NODE_ENV: 'production' })
  return Math.round(performance.now() - t)
}

function publicHashes() {
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

async function start(runtime, command = [weft(), 'start', '--runtime', runtime]) {
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

const link = (id, input) =>
  `/_weft/fn/${id}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`
const call = async (url, id, input) => {
  const r = await fetch(`${url}${link(id, input)}`)
  return { status: r.status, body: await r.json() }
}

/** What the server answers, for comparing builds. A checksum covers every byte of the thumbnail. */
async function wire(url) {
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

async function browserRun(url) {
  if (!values.browser) return undefined
  const { chromium } = createRequire(join(repo, 'packages/start/package.json'))('playwright-core')
  const browser = await chromium.launch()
  const seen = []
  try {
    const page = await (await browser.newContext({ baseURL: url })).newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
      if (r.url().includes('/_weft/fn/')) seen.push(new URL(r.url()).pathname)
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
async function bench(url) {
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

async function variant(name, runtime, results) {
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

// ---- prepare --------------------------------------------------------------------------------------------------------

mkdirSync(dir, { recursive: true })
log(`scaffold in ${dir}`)
must(
  'node',
  [
    join(repo, 'packages/create/bin/create-weft.mjs'),
    dir,
    '--db',
    'none',
    '--ui',
    'none',
    '--name',
    'thumb',
  ],
  repo,
)
const pkgFile = join(dir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
for (const deps of [pkg.dependencies, pkg.devDependencies])
  for (const name of Object.keys(deps ?? {}))
    if (name === '@weft-js/core' || name.startsWith('@weft-js/')) deps[name] = packageUrl(name)
pkg.dependencies.zod = '4.6.7'
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
must('npm', ['install', '--no-audit', '--no-fund'])
cpSync(join(here, 'phase5b/app'), dir, { recursive: true })
cpSync(join(here, 'phase5b/ts'), dir, { recursive: true })

const results = { ts: {}, rust: {}, wasm: {} }
const tree = () =>
  Object.fromEntries(
    readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => join(f.parentPath, f.name))
      .map((f) => [
        relative(dir, f),
        createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12),
      ]),
  )
const serverText = () =>
  readdirSync(join(dir, '.output/server'), { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && /\.m?js$/.test(f.name))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'))
    .join('\n')

// ---- before ---------------------------------------------------------------------------------------------------------

const treeBefore = tree()
must(weft(), ['check'])
for (const r of runtimes) await variant('ts', r, results)
await check('a build with no `native()` has none of it', () => {
  const text = serverText()
  ok(!text.includes('dlopen'), 'dlopen in the server bundle')
  ok(!text.includes('weft_alloc'), 'the WASM loader in the server bundle')
  ok(!existsSync(join(dir, '.output/server/rust')), '.output/server/rust')
})

// ---- the swap -------------------------------------------------------------------------------------------------------

rmSync(join(dir, 'src/server/image.ts'))
cpSync(join(here, 'phase5b/rust'), dir, { recursive: true })
const cargoFile = join(dir, 'crates/media/Cargo.toml')
writeFileSync(
  cargoFile,
  readFileSync(cargoFile, 'utf8').replaceAll('WEFT_CRATE', join(repo, 'crates/weft')),
)
const treeAfter = tree()
const changed = Object.keys({ ...treeBefore, ...treeAfter })
  .filter((f) => treeBefore[f] !== treeAfter[f])
  .sort()
log('changed under src/:', changed)

await check('the swap touches server modules only', () => {
  eq(changed, ['src/server/image.ts', 'src/server/rust.ts', 'src/server/thumb.ts'], 'changed files')
  return { changed }
})

for (const r of runtimes)
  await variant('rust', r, results).then(
    () => {},
    (e) => {
      checks.push({ name: `the addon serves on ${r}`, ok: false, error: e.message })
      log(`FAIL on ${r}: ${e.message}`)
    },
  )

for (const r of runtimes) {
  const before = results.ts[r],
    after = results.rust[r]
  await check(`${r}: the client is byte-identical`, () => {
    ok(after, 'no Rust run')
    eq(after.hashes, before.hashes, '.output/public')
    return { files: Object.keys(after.hashes).length }
  })
  await check(`${r}: /thumb serves the same HTML`, () => eq(after.html, before.html, 'HTML'))
  await check(`${r}: every request gets the same answer, to the byte`, () => {
    for (const k of Object.keys(before.wire)) eq(after.wire[k], before.wire[k], k)
    return { requests: Object.keys(before.wire).length }
  })
  if (values.browser)
    await check(`${r}: the same e2e passes in Chromium`, () => {
      eq(after.browser, before.browser, 'browser run')
      eq(after.browser.errors, [], 'page errors')
      eq(after.browser.hydrated, 0, 'requests during hydration')
      return { failed: after.browser.failed }
    })
}

const speed = Object.fromEntries(
  runtimes
    .filter((r) => results.rust[r])
    .map((r) => {
      const ts = results.ts[r].bench,
        rust = results.rust[r].bench
      return [
        r,
        {
          ts,
          rust,
          latency: +(ts.p50 / rust.p50).toFixed(1),
          throughput: +(rust.perSecond / ts.perSecond).toFixed(1),
        },
      ]
    }),
)
for (const r of runtimes.filter((x) => x !== 'deno'))
  await check(`${r}: the addon beats its TS \`run\` by at least ${REQUIRED}×`, () => {
    const s = speed[r]
    ok(s, 'no Rust run')
    ok(s.latency >= REQUIRED, `p50 is only ${s.latency}× (${s.ts.p50} ms to ${s.rust.p50} ms)`)
    ok(
      s.throughput >= REQUIRED,
      `throughput is only ${s.throughput}× (${s.ts.perSecond} to ${s.rust.perSecond} calls/s)`,
    )
    return { latency: s.latency, throughput: s.throughput }
  })

// ---- only native() has these ----------------------------------------------------------------------------------------

const addons = () =>
  readdirSync(join(dir, '.output/server/rust')).filter((f) => f.endsWith('.node'))

/** A call that spins for 200 ms. */
const spin = (url) => call(url, ID.spin)

for (const r of runtimes) {
  build(r)
  const s = await start(r)
  try {
    await check(`${r}: a tag Rust adds reaches the response`, async () => {
      const { body } = await call(s.url, ID.stats)
      eq(body.t, ['images', 'images:all'], 'tags')
    })
    await check(
      `${r}: a panic costs one call, in R108, with the detail in the log only`,
      async () => {
        const a = await call(s.url, ID.boom)
        eq([a.status, a.body.e.code], [500, 'R108'], 'the answer')
        ok(!JSON.stringify(a.body).includes('the eval asked'), 'the detail reached the client')
        await until('the log line', () => s.output().includes('the eval asked for this'), 3000)
        eq(
          (await call(s.url, ID.thumbnail, { seed: 3, width: 64, height: 64 })).status,
          200,
          'the next call',
        )
      },
    )
    await check(
      `${r}: past its deadline TS gives up with R107, and the loop stays free`,
      async () => {
        const t = performance.now()
        const [slow, quick] = await Promise.all([
          spin(s.url),
          sleep(20)
            .then(() => call(s.url, ID.guarded, { width: 2, height: 2 }))
            .then((a) => ({ a, ms: performance.now() - t })),
        ])
        eq([slow.status, slow.body.e.code], [504, 'R107'], 'the spin')
        eq(quick.a.status, 200, 'a call during it')
        ok(quick.ms < 150, `a call during a 200 ms spin took ${Math.round(quick.ms)} ms`)
        return { duringSpinMs: Math.round(quick.ms) }
      },
    )
    await check(`${r}: more than 4 calls run at once`, async () => {
      const t = performance.now()
      await Promise.all(Array.from({ length: 8 }, () => spin(s.url)))
      const ms = Math.round(performance.now() - t)
      ok(ms < 340, `8 spins of 200 ms took ${ms} ms, so the pool is small`)
      return { ms }
    })
  } finally {
    await s.stop()
  }

  await check(`${r}: a stale library is refused with R103`, async () => {
    const file = join(dir, '.output/server/rust/manifest.json')
    const held = readFileSync(file, 'utf8')
    writeFileSync(file, held.replaceAll(JSON.parse(held).media.hash, 'ffffffffffffffff'))
    const stale = await start(r)
    try {
      const a = await call(stale.url, ID.thumbnail, { seed: 1, width: 64, height: 64 })
      eq([a.status, a.body.e.code], [502, 'R103'], 'the answer')
      eq((await fetch(`${stale.url}/about`)).status, 200, 'a page')
    } finally {
      await stale.stop()
      writeFileSync(file, held)
    }
  })

  // No addon for this platform: what a host on another machine gets.
  for (const f of addons()) rmSync(join(dir, '.output/server/rust', f))
  const w = await start(r)
  try {
    await check(`${r}: with the addon gone, its WASM gives the same answers`, async () => {
      const got = await wire(w.url)
      for (const k of Object.keys(results.ts[r].wire)) eq(got[k], results.ts[r].wire[k], k)
      return { requests: Object.keys(got).length }
    })
    await check(
      `${r}: on WASM a panic ends an instance, and the next call has a new one`,
      async () => {
        eq((await call(w.url, ID.boom)).body.e.code, 'R108', 'the panic')
        await until('the log line', () => w.output().includes('the eval asked for this'), 3000)
        eq(
          (await call(w.url, ID.thumbnail, { seed: 3, width: 64, height: 64 })).status,
          200,
          'the next call',
        )
      },
    )
    await check(`${r}: on WASM \`ctx.remaining()\` runs on the host's clock`, async () => {
      const t = performance.now()
      const a = await spin(w.url)
      const ms = performance.now() - t
      ok(ms >= 190 && ms < 2000, `a 200 ms spin took ${Math.round(ms)} ms`)
      eq(a.status, 200, 'a spin that returns')
    })
    results.wasm[r] = await bench(w.url)
    log(`wasm on ${r}:`, results.wasm[r])
  } finally {
    await w.stop()
  }
}

build('node')
await check('`node .output/server/index.mjs` finds the addon with no `weft start`', async () => {
  const s = await start('node', ['node', '.output/server/index.mjs'])
  try {
    const a = await call(s.url, ID.thumbnail, { seed: 1, width: 64, height: 64 })
    eq(a.status, 200, `the answer: ${JSON.stringify(a.body).slice(0, 300)}`)
  } finally {
    await s.stop()
  }
})

// ---- weft check -----------------------------------------------------------------------------------------------------

const weftCheck = () => JSON.parse(run(weft(), ['check', '--json']).stdout || '{}')
const server = join(dir, 'src/server/thumb.ts')
const main = join(dir, 'crates/media/src/lib.rs')
const cleanServer = readFileSync(server, 'utf8'),
  cleanMain = readFileSync(main, 'utf8')

await check('`weft check` passes the clean app, with no warning', () => {
  const r = weftCheck()
  eq([r.ok, r.diagnostics?.filter((d) => d.code.startsWith('R1'))], [true, []], 'check')
  return r.summary
})
await check('R103: an edited schema stops cargo at the function it broke, named by id', () => {
  writeFileSync(
    server,
    cleanServer.replace(
      'const Done = z.object({ checksum: z.string(),',
      'const Done = z.object({ checksum: z.string(), format: z.string(),',
    ),
  )
  const r = weftCheck().diagnostics.filter((d) => d.code === 'R103')
  writeFileSync(server, cleanServer)
  ok(
    r.some((d) => d.why.includes(ID.thumbnail)),
    `no id in ${JSON.stringify(r)}`,
  )
  ok(
    r.some((d) => d.file === 'crates/media/src/lib.rs' && d.span[0] > 1),
    `no location in ${JSON.stringify(r)}`,
  )
  return { line: r[0].span[0], why: r[0].why.slice(0, 120) }
})
await check('R104: an edge preset is refused with the fix, before anything compiles', () => {
  const r = run(weft(), ['build', '--preset', 'cloudflare_module'], dir, { NODE_ENV: 'production' })
  ok(r.status !== 0, 'the build passed')
  const text = `${r.stdout}${r.stderr}`
  ok(text.includes('R104') && text.includes("remote('rust://media')"), text.slice(-600))
})
await check("R104: a crate that won't build for WASM is a warning here, with the way out", () => {
  writeFileSync(
    main,
    `#[cfg(target_family = "wasm")]\ncompile_error!("this crate links C");\n${cleanMain}`,
  )
  const r = weftCheck()
  writeFileSync(main, cleanMain)
  const hit = r.diagnostics.find((d) => d.code === 'R104')
  ok(hit?.severity === 'warning', JSON.stringify(r.diagnostics))
  ok(hit.why.includes('wasm: false'), hit.why)
  eq(r.ok, true, 'check')
  return hit.why.slice(0, 120)
})
await check('R105: a cached query with tags and no `touch`, at the method', () => {
  writeFileSync(main, cleanMain.replace('        ctx.touch("images");\n', ''))
  const r = weftCheck().diagnostics.filter((d) => d.code === 'R105')
  writeFileSync(main, cleanMain)
  eq(r.length, 1, `R105s: ${JSON.stringify(r)}`)
  eq(r[0].file, 'crates/media/src/lib.rs', 'file')
  ok(r[0].span[0] > 1 && r[0].why.includes(ID.stats), JSON.stringify(r[0]))
  return { line: r[0].span[0] }
})

// ---- weft dev -------------------------------------------------------------------------------------------------------

{
  const port = await freePort()
  const child = spawn(weft(), ['dev', '--port', String(port)], {
    cwd: dir,
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
  const firstBuild = performance.now()
  const polling = { on: true }
  const polls = []
  const input = { seed: 5, width: 64, height: 64 }
  try {
    await until(
      `weft dev: ${output}`,
      async () => (await call(url, ID.thumbnail, input)).status === 200,
      240_000,
    )
    const firstMs = Math.round(performance.now() - firstBuild)
    const poller = (async () => {
      while (polling.on) {
        const a = await call(url, ID.thumbnail, input).catch((e) => ({
          status: 0,
          body: { e: { code: e.message } },
        }))
        polls.push({
          status: a.status,
          code: a.body?.e?.code,
          checksum: a.body?.v?.checksum,
          format: a.body?.v?.format,
        })
        await sleep(10)
      }
    })()
    await check('dev: the first request works, after one build', () => ({ firstMs }))

    await check(
      'dev: a crate edit reloads in place, with no failed request and no new worker',
      async () => {
        polls.length = 0
        const t = performance.now()
        writeFileSync(
          main,
          cleanMain.replace(
            'checksum: format!("{hash:08x}")',
            'checksum: format!("v2-{hash:08x}")',
          ),
        )
        await until('the new library', () => polls.at(-1)?.checksum?.startsWith('v2-'), 180_000)
        const ms = Math.round(performance.now() - t)
        await sleep(300)
        eq(
          polls.filter((p) => p.status !== 200),
          [],
          'failed polls during the reload',
        )
        ok(
          existsSync(join(dir, '.weft/native/media-2.node')),
          'the second build has a path of its own',
        )
        return { reloadMs: ms, requests: polls.length }
      },
    )

    await check('dev: a compile error keeps the old library serving', async () => {
      polls.length = 0
      writeFileSync(main, cleanMain.replace('fn photo(seed: u32', 'fn photo(seed: u33'))
      await until('R109 in the log', () => output.includes("`media` doesn't compile"), 120_000)
      await sleep(100)
      eq(
        polls.filter((p) => p.status !== 200),
        [],
        'failed polls',
      )
    })

    await check(
      'dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers',
      async () => {
        writeFileSync(main, cleanMain)
        writeFileSync(
          server,
          cleanServer.replace(
            'const Done = z.object({ checksum: z.string(),',
            'const Done = z.object({ checksum: z.string(), format: z.string(),',
          ),
        )
        const said = `R103 error: \`${ID.thumbnail}\`: the Rust no longer matches the contract`
        await until('R103 from cargo in the log', () => output.includes(said), 120_000)
        writeFileSync(
          main,
          cleanMain.replace(
            'Ok(ThumbnailOutput { checksum:',
            'Ok(ThumbnailOutput { format: "fnv".to_string(), checksum:',
          ),
        )
        await until('the fixed library', () => polls.at(-1)?.format === 'fnv', 180_000)
      },
    )
    polling.on = false
    await poller
  } finally {
    polling.on = false
    writeFileSync(server, cleanServer)
    writeFileSync(main, cleanMain)
    try {
      if (child.pid) process.kill(-child.pid, 'SIGINT')
    } catch {}
    await Promise.race([
      new Promise((closed) => {
        child.on('close', closed)
      }),
      sleep(8000),
    ])
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
}

// ---- weft add rust --------------------------------------------------------------------------------------------------

await check(
  '`weft add rust`: a native crate and a sidecar build, check clean and answer, on the first try',
  async () => {
    must(weft(), ['add', 'rust', 'hasher', '--no-install'])
    must(weft(), ['add', 'rust', 'finder', '--remote', '--no-install'])
    const r = weftCheck()
    eq([r.ok, r.diagnostics?.filter((d) => d.code.startsWith('R1'))], [true, []], 'check')
    build('node')
    const s = await start('node')
    try {
      for (const name of ['hasher', 'finder']) {
        const a = await call(s.url, fnId('digest', `src/server/${name}.ts`), { text: 'hello' })
        eq([a.status, a.body.v], [200, { bytes: 5, hash: '4f9f2cab' }], name)
      }
    } finally {
      await s.stop()
    }
    return {
      sizes: JSON.parse(readFileSync(join(dir, '.output/server/rust/manifest.json'), 'utf8')),
    }
  },
)

// ---- report ---------------------------------------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length
const failed = checks.filter((c) => !c.ok)
const sizes = JSON.parse(readFileSync(join(dir, '.output/server/rust/manifest.json'), 'utf8')).media
const host = `${process.platform}-${process.arch}, ${navigator.hardwareConcurrency} threads, load ${loadavg()[0].toFixed(1)} at the end`
const result = {
  date: new Date().toISOString().slice(0, 10),
  ok: !failed.length,
  host,
  runtimes,
  changed,
  speed,
  wasm: results.wasm,
  sizes,
  checks,
}
mkdirSync(join(here, 'results'), { recursive: true })
writeJson(join(here, `results/${values.results}.json`), result)
const speedRows = Object.entries(speed).flatMap(([r, s]) => [
  `| ${r} | TS \`run\` | ${s.ts.p50} | ${s.ts.p99} | ${s.ts.perSecond} | |`,
  `| ${r} | addon | ${s.rust.p50} | ${s.rust.p99} | ${s.rust.perSecond} | **${s.latency}× p50, ${s.throughput}× calls/s** |`,
  ...(results.wasm[r]
    ? [
        `| ${r} | WASM | ${results.wasm[r].p50} | ${results.wasm[r].p99} | ${results.wasm[r].perSecond} | ${+(s.ts.p50 / results.wasm[r].p50).toFixed(1)}× p50 |`,
      ]
    : []),
])
writeFileSync(
  join(here, `results/${values.results}.md`),
  `# Phase 5b exit check

${result.date}: **${failed.length ? 'FAIL' : 'PASS'}**, ${passed} of ${checks.length} checks, on ${host}. A CPU-bound demo beats its TS \`run\` by at least ${REQUIRED}×.
The swap is scripted (\`evals/gates/phase5b-exit.mjs\`, the app in \`evals/phase5b/\`), not done by an agent. \`weft start\` on ${runtimes.join(', ')}.

Changed under \`src/\`: ${changed.map((f) => `\`${f}\``).join(', ')}. Added: \`crates/media\`. Addon ${Math.round(sizes.bytes / 1024)} KB, WASM ${Math.round(sizes.wasmBytes / 1024)} KB.

| Check | Result | Detail |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : `**FAIL**: ${String(c.error).split('\n')[0].slice(0, 160).replaceAll('|', '\\|')}`} | ${c.detail ? `\`${JSON.stringify(c.detail).slice(0, 110).replaceAll('|', '\\|')}\`` : ''} |`).join('\n')}

## Speed

A 1600×1200 RGBA image, four passes of a 5-tap blur each way and an 8× box shrink, through the public \`GET /_weft/fn/<id>\`. TS and Rust produce the same bytes, which the wire check holds them to.
Sequential p50 and p99, then 32 callers at once. A within-weft comparison of two server bodies: the \`benchmarks/compare\` stacks have no server functions.

| Runtime | Body | p50 ms | p99 ms | calls/s | Over TS |
|---|---|---|---|---|---|
${speedRows.join('\n')}
`,
)
log(`${failed.length ? 'FAIL' : 'PASS'}: ${passed}/${checks.length}`)
for (const f of failed) log(`  ${f.name}: ${String(f.error).slice(0, 300)}`)
process.exit(failed.length ? 1 : 0)
