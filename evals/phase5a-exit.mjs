#!/usr/bin/env node
// Phase 5a's exit check (PLAN §9, "5a. Rust: remote"; research 36): a search sidecar replaces a TS `query` with no client
// change. The same app is built twice. Before: every function's body is a TS `run`. After: each is `impl: search`, and
// a Rust crate does the work. The swap touches server modules and adds a crate; this script holds it to that, and to
// the claim that follows from it:
//
//   client   `.output/public` is byte-identical, and `/search` serves byte-identical HTML
//   wire     the same requests get the same answers (values, tags, errors, statuses)
//   browser  the same e2e passes in Chromium: SSR, 0-fetch hydration, single-flight mutation, a typed error
//
// then what only the Rust side has: a sidecar killed under load, a forged call, a Rust-added tag and `touch`, `weft dev`
// reload with no failed request, a schema edit reported as R103 with the function's id, and R101/R102 from `weft check`.
// Each `weft start` runs on Node, Bun and Deno. The swap is scripted, not done by an agent.
//
//   node evals/phase5a-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--docs 20000]
//
// Writes evals/results/phase5a-exit.md and .json; exit 1 if any check fails. Needs cargo, and bun and deno for those
// runtimes, packages/weft's native compiler built, and each package's dependencies installed.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const { values, positionals } = parseArgs({ allowPositionals: true, options: { runtimes: { type: 'string', default: 'node,bun,deno' }, docs: { type: 'string', default: '20000' } } })
if (!positionals[0]) { console.error('usage: phase5a-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--docs 20000]'); process.exit(1) }
const dir = resolve(positionals[0])
if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`)
const runtimes = values.runtimes.split(',')
const { chromium } = createRequire(join(repo, 'packages/start/package.json'))('playwright-core')
const { fnId } = await import(join(repo, 'packages/start/src/vite.mjs'))

const log = (...a) => console.log('[5a]', ...a)
const run = (cmd, args, cwd = dir, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...env } })
const must = (cmd, args, cwd, env) => {
  const r = run(cmd, args, cwd, env)
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`)
  return r
}
const sleep = ms => new Promise(ok => setTimeout(ok, ms))
const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const until = async (what, fn, ms = 60_000) => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}
const weft = () => join(dir, 'node_modules/.bin/weft')
const ID = { search: fnId('searchDocs', 'src/server/docs.ts'), popular: fnId('popular', 'src/server/docs.ts'), get: fnId('getDoc', 'src/server/docs.ts'), add: fnId('addDoc', 'src/server/docs.ts') }

const checks = []
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)?.slice(0, 400)}, want ${JSON.stringify(b)?.slice(0, 400)}`) }
const ok = (v, what) => { if (!v) throw new Error(what) }
async function check(name, fn) {
  const t = performance.now()
  try {
    const detail = await fn()
    checks.push({ name, ok: true, ms: Math.round(performance.now() - t), ...(detail !== undefined && { detail }) })
    log(`pass: ${name}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 120)})` : ''}`)
  } catch (e) {
    checks.push({ name, ok: false, error: e.message })
    log(`FAIL: ${name}\n${e.stack}`)
  }
}

// ---- the corpus -----------------------------------------------------------------------------------------------------

function corpus(count) {
  const vocab = ['lantern', 'compass', 'harbor', 'meadow', 'granite', 'willow', 'ember', 'thicket', 'quartz', 'falcon', 'orchard', 'tundra', 'mosaic', 'cinder', 'estuary', 'juniper', 'kestrel', 'lichen', 'marrow', 'nectar', 'obsidian', 'pumice', 'quiver', 'russet', 'sable', 'tallow', 'umber', 'vellum', 'wicker', 'yarrow']
  for (let i = 0; i < 3000; i++) vocab.push(`w${i.toString(36)}`)
  let seed = 42
  const next = n => (seed = (seed * 1664525 + 1013904223) >>> 0, Math.floor((seed / 2 ** 32) * n))
  // Skewed, as words are: most text is a few words.
  const word = () => vocab[Math.floor(vocab.length * (next(1000) / 1000) ** 3)]
  return Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    title: `${word()} ${word()} ${word()}`,
    body: Array.from({ length: 80 }, word).join(' '),
  }))
}

// ---- running a build ------------------------------------------------------------------------------------------------

function build(runtime) {
  const t = performance.now()
  must(weft(), ['build', '--runtime', runtime], dir, { NODE_ENV: 'production' })
  return Math.round(performance.now() - t)
}

function publicHashes() {
  const root = join(dir, '.output/public')
  const out = {}
  for (const f of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue
    const file = join(f.parentPath, f.name)
    out[relative(root, file)] = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
  }
  return out
}

async function start(runtime) {
  const port = await freePort()
  const child = spawn(weft(), ['start', '--runtime', runtime], { cwd: dir, env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let output = ''
  child.stdout.on('data', d => { output += d })
  child.stderr.on('data', d => { output += d })
  const url = `http://localhost:${port}`
  await until(`${runtime} on ${port}: ${output}`, async () => (await fetch(`${url}/`, { redirect: 'manual' })).status > 0)
  return {
    url, output: () => output,
    async stop() {
      if (child.exitCode !== null) return
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      const done = new Promise(ok => child.on('close', ok))
      await Promise.race([done, sleep(3000)])
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    },
  }
}

const call = async (url, id, input) => {
  const r = await fetch(`${url}/_weft/fn/${id}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`)
  return { status: r.status, body: await r.json() }
}

/** What the server answers, for comparing the two builds. No mutation: each run starts from the same index. */
async function wire(url) {
  const out = {}
  for (const [q, limit] of [['lantern', 5], ['compass harbor', 10], ['  granite  ', 3], ['nothingmatchesthis', 5], ['w1 w2 w3 w4', 50], ['quartz', undefined]]) {
    out[`search:${q}:${limit}`] = await call(url, ID.search, { q, limit })
  }
  out.empty = await call(url, ID.search, { q: '', limit: 5 })
  out.long = await call(url, ID.search, { q: 'x'.repeat(201), limit: 5 })
  out.limit = await call(url, ID.search, { q: 'x', limit: 51 })
  out.popular = await call(url, ID.popular, { limit: 3 })
  out.get = await call(url, ID.get, { id: 'doc-7' })
  out.missing = await call(url, ID.get, { id: 'no-such-doc' })
  // The one difference a sidecar chose: it adds a tag to `getDoc`, which the Rust-only check reads.
  out.get.body.t = out.get.body.t.filter(x => !x.startsWith('doc:'))
  for (const a of [out.missing, out.empty, out.long, out.limit]) if (a.body.e?.message) a.body.e.message = a.body.e.message.replace(/\n.*/s, '')
  return out
}

async function browserRun(url) {
  const browser = await chromium.launch()
  const seen = []
  try {
    const page = await (await browser.newContext({ baseURL: url })).newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('request', r => { if (r.url().includes('/_weft/fn/')) seen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    const hits = () => page.$$eval('ul.hits li', l => l.map(x => x.textContent.trim()))
    const before = await hits()
    ok(before.length === 5, `SSR hits: ${before.length}`)
    const title = await page.title()
    const hydrated = seen.length
    await page.getByLabel('Search').fill('compass')
    await page.waitForFunction(old => document.querySelector('ul.hits li')?.textContent !== old, before[0])
    const compass = await hits()
    const afterSearch = seen.length

    await page.getByLabel('Search').fill('zebra')
    await page.waitForFunction(() => document.querySelectorAll('ul.hits li').length === 0)
    await page.waitForLoadState('networkidle')
    const mark = seen.length
    await page.getByLabel('Title').fill('Zebra lantern')
    const posted = page.waitForResponse(r => r.url().includes('/_weft/fn/') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Add' }).click()
    await posted
    await page.locator('ul.hits li', { hasText: 'Zebra lantern' }).first().waitFor({ timeout: 5000 })
    const added = await hits()
    await page.waitForLoadState('networkidle')
    const addRequests = seen.slice(mark)

    await page.getByRole('button', { name: 'Open' }).click()
    await page.locator('output', { hasText: 'NotFound:no-such-doc' }).waitFor({ timeout: 5000 })
    return { title, hydrated, before, compass, afterSearch, added, addRequests, output: await page.locator('output').textContent(), errors }
  } finally {
    await browser.close()
  }
}

/** Sequential calls, then 32 at once, against a running build. The server's own overhead is in both. */
async function bench(url) {
  const queries = ['lantern', 'compass harbor', 'granite willow ember', 'w1 w2 w3 w4 w5', 'meadow'].map(q => `${url}/_weft/fn/${ID.search}?i=${encodeURIComponent(JSON.stringify({ q, limit: 20 }))}`)
  const one = u => fetch(u).then(r => r.text())
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
  await Promise.all(Array.from({ length: 32 }, async (_, w) => { for (let i = 0; i < 250; i++) await one(queries[(i + w) % 5]), n++ }))
  return { p50: +times[750].toFixed(2), p99: +times[1485].toFixed(2), perSecond: Math.round(n / ((performance.now() - t) / 1000)) }
}

async function variant(name, runtime, results) {
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
    throw new Error(`${e.message}\n--- server\n${s.output().slice(-3000)}`)
  } finally {
    await s.stop()
  }
}

// ---- prepare --------------------------------------------------------------------------------------------------------

mkdirSync(dir, { recursive: true })
log(`scaffold in ${dir}`)
must('node', [join(repo, 'packages/create-weft/bin/create-weft.mjs'), dir, '--db', 'none', '--ui', 'none', '--name', 'search'], repo)
const pkgFile = join(dir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name of Object.keys(deps ?? {})) if (name === '@weft-js/core' || name.startsWith('@weft-js/')) deps[name] = `file:${join(repo, 'packages', name.replace('@weft-js/core', 'weft').replace('@weft-js/create', 'create-weft').replace('@weft-js/warp-icons', 'icons').replace('@weft-js/', ''))}`
pkg.dependencies.zod = '4.6.7'
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
must('npm', ['install', '--no-audit', '--no-fund'])
cpSync(join(here, 'phase5a/app'), dir, { recursive: true })
cpSync(join(here, 'phase5a/ts'), dir, { recursive: true })
writeFileSync(join(dir, 'src/server/corpus.json'), JSON.stringify(corpus(Number(values.docs))))

const results = { ts: {}, rust: {} }
const tree = () => Object.fromEntries(readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => join(f.parentPath, f.name)).map(f => [relative(dir, f), createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12)]))

// ---- before ---------------------------------------------------------------------------------------------------------

/** `tsc` on the app, as evals/phase3b-exit.mjs runs it: what a linked package reports isn't the app's. */
function types() {
  const shared = ['zod']
  const paths = Object.fromEntries(shared.flatMap(p => [[p, [`./node_modules/${p}`]], [`${p}/*`, [`./node_modules/${p}/*`]]]))
  writeFileSync(join(dir, 'tsconfig.check.json'), JSON.stringify({ extends: './tsconfig.json', compilerOptions: { preserveSymlinks: true, baseUrl: '.', paths, resolveJsonModule: true }, include: ['src'] }, null, 2))
  const out = run(join(repo, 'packages/weft/node_modules/.bin/tsc'), ['--noEmit', '-p', 'tsconfig.check.json']).stdout
  return out.split('\n').filter(l => /^src\/.*error TS/.test(l))
}

const treeBefore = tree()
must(weft(), ['check']) // the slots and route types tsc reads
const typesBefore = types()
for (const r of runtimes) await variant('ts', r, results)

// ---- the swap -------------------------------------------------------------------------------------------------------

rmSync(join(dir, 'src/server/rank.ts'))
cpSync(join(here, 'phase5a/rust'), dir, { recursive: true })
const cargoFile = join(dir, 'crates/search/Cargo.toml')
writeFileSync(cargoFile, readFileSync(cargoFile, 'utf8').replaceAll('WEFT_CRATE', join(repo, 'crates/weft')))
const treeAfter = tree()
const changed = Object.keys({ ...treeBefore, ...treeAfter }).filter(f => treeBefore[f] !== treeAfter[f]).sort()
log('changed under src/:', changed)

await check('the swap touches server modules only', () => {
  eq(changed, ['src/server/docs.ts', 'src/server/rank.ts', 'src/server/rust.ts'], 'changed files')
  return { changed }
})

await check('the app type-checks before and after, with the same client types', () => {
  must(weft(), ['check'])
  eq([typesBefore, types()], [[], []], 'tsc errors under src/')
})

for (const r of runtimes) await variant('rust', r, results).then(() => {}, e => { checks.push({ name: `the Rust build serves on ${r}`, ok: false, error: e.message }); log(`FAIL on ${r}: ${e.message}`) })

for (const r of runtimes) {
  const before = results.ts[r], after = results.rust[r]
  await check(`${r}: the client is byte-identical`, () => {
    ok(after, 'no Rust run')
    eq(after.hashes, before.hashes, '.output/public')
    return { files: Object.keys(after.hashes).length }
  })
  await check(`${r}: /search serves the same HTML`, () => eq(after.html, before.html, 'HTML'))
  await check(`${r}: every request gets the same answer`, () => {
    for (const k of Object.keys(before.wire)) eq(after.wire[k], before.wire[k], k)
    return { requests: Object.keys(before.wire).length }
  })
  await check(`${r}: the same e2e passes in Chromium`, () => {
    eq(after.browser, before.browser, 'browser run')
    eq(after.browser.hydrated, 0, 'requests during hydration')
    eq(after.browser.errors, [], 'page errors')
    eq(after.browser.addRequests.filter(x => x.startsWith('GET')), [], 'a GET after the mutation (single-flight)')
    eq(after.browser.output, 'NotFound:no-such-doc', 'typed error')
    return { compassTop: after.browser.compass[0], added: after.browser.added[0] }
  })
}

const speed = Object.fromEntries(runtimes.filter(r => results.rust[r]).map(r => [r, { ts: results.ts[r].bench, rust: results.rust[r].bench }]))

// ---- only the Rust side has these -----------------------------------------------------------------------------------

build('node')
{
  const s = await start('node')
  try {
    await check('a tag Rust adds reaches the response', async () => {
      const { body } = await call(s.url, ID.get, { id: 'doc-7' })
      eq(body.t, ['docs', 'doc:doc-7'], 'tags')
      return { tags: body.t }
    })
    const addr = /search: listening on (\S+)/.exec(s.output())?.[1]
    ok(addr, `no sidecar address in: ${s.output()}`)
    await check('a forged or unsigned call to the sidecar is refused', async () => {
      const unsigned = await fetch(`http://${addr}/_weft/fn/${ID.search}`, { method: 'POST', body: '{"input":{"q":"x","limit":1}}' })
      eq(unsigned.status, 401, 'no signature')
      const forged = await fetch(`http://${addr}/_weft/fn/${ID.search}`, { method: 'POST', headers: { 'weft-ctx': 'e30', 'weft-sig': randomBytes(32).toString('hex') }, body: '{"input":{"q":"x","limit":1}}' })
      eq(forged.status, 401, 'a made-up signature')
    })
    await check('a killed sidecar costs that function, not the server, and comes back', async () => {
      const { pid } = await (await fetch(`http://${addr}/_weft/health`)).json()
      process.kill(pid, 'SIGKILL')
      const down = await until('the failure', async () => {
        const a = await call(s.url, ID.search, { q: 'lantern', limit: 1 })
        return a.status !== 200 && a
      }, 5000)
      eq([down.status, down.body.e.code], [503, 'R107'], 'while down')
      eq((await fetch(`${s.url}/about`)).status, 200, 'a page while the sidecar is down')
      const t = performance.now()
      await until('the restart', async () => (await call(s.url, ID.search, { q: 'lantern', limit: 1 })).status === 200, 15_000)
      return { backMs: Math.round(performance.now() - t) }
    })
  } finally {
    await s.stop()
  }
  await check('stopping `weft start` stops the sidecar', async () => {
    const addr = /search: listening on (\S+)/.exec(s.output())?.[1]
    await until('the port to close', async () => {
      try { await fetch(`http://${addr}/_weft/health`); return false } catch { return true }
    }, 5000)
  })
}

// ---- weft check -----------------------------------------------------------------------------------------------------

const weftCheck = () => JSON.parse(run(weft(), ['check', '--json']).stdout || '{}')
const docs = join(dir, 'src/server/docs.ts')
const main = join(dir, 'crates/search/src/main.rs')
const cleanDocs = readFileSync(docs, 'utf8'), cleanMain = readFileSync(main, 'utf8')

await check('`weft check` passes the clean sidecar app', () => {
  const r = weftCheck()
  eq(r.ok, true, `check: ${JSON.stringify(r.diagnostics)?.slice(0, 800)}`)
  return r.summary
})
await check('R101: a date, a void and a one-way transform', () => {
  writeFileSync(docs, `${cleanDocs}
export const when = query({ output: z.date(), impl: search })
export const nothing = mutation({ output: z.void(), impl: search })
export const shout = query({ input: z.object({ a: z.string().transform(s => s.length) }), output: z.null(), impl: search })
`)
  const r = weftCheck().diagnostics.filter(d => d.code === 'R101')
  writeFileSync(docs, cleanDocs)
  eq(r.length, 3, `R101s: ${JSON.stringify(r)}`)
  ok(r.some(d => d.why.includes('when.') && d.why.includes('z.codec')), 'names the function and the fix')
  return r.map(d => d.why.slice(0, 60))
})
await check('R102: a plain union of objects, and not a nullable or a scalar union', () => {
  writeFileSync(docs, `${cleanDocs}
export const either = query({ output: z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]), impl: search })
`)
  const r = weftCheck().diagnostics.filter(d => d.code === 'R102')
  writeFileSync(docs, cleanDocs)
  eq(r.length, 1, 'R102s')
  ok(r[0].why.includes('either.'), r[0].why)
})
await check('R103: an edited schema stops cargo at the function it broke, named by id', () => {
  writeFileSync(docs, cleanDocs.replace("score: z.number() })", "score: z.number(), lang: z.string() })"))
  const r = weftCheck().diagnostics.filter(d => d.code === 'R103')
  writeFileSync(docs, cleanDocs)
  ok(r.length, 'no R103')
  ok(r.some(d => d.why.includes(ID.search)), `no id in ${JSON.stringify(r)}`)
  ok(r.some(d => d.file === 'crates/search/src/main.rs' && d.span[0] > 1), `no location in ${JSON.stringify(r)}`)
  return { file: r[0].file, line: r[0].span[0], why: r[0].why.slice(0, 120) }
})
await check('R109: a compile error no function explains is told apart', () => {
  writeFileSync(main, cleanMain.replace('fn words(text: &str)', 'fn words(text: &strr)'))
  const r = weftCheck().diagnostics.filter(d => /^R10[39]$/.test(d.code))
  writeFileSync(main, cleanMain)
  ok(r.some(d => d.code === 'R109'), JSON.stringify(r))
})

// ---- weft dev -------------------------------------------------------------------------------------------------------

{
  const port = await freePort()
  const child = spawn(weft(), ['dev', '--port', String(port)], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let output = ''
  child.stdout.on('data', d => { output += d })
  child.stderr.on('data', d => { output += d })
  const url = `http://localhost:${port}`
  const firstBuild = performance.now()
  let polling = true
  const polls = []
  try {
    await until(`weft dev: ${output}`, async () => (await call(url, ID.search, { q: 'lantern', limit: 1 })).status === 200, 240_000)
    const firstMs = Math.round(performance.now() - firstBuild)
    const poller = (async () => {
      while (polling) {
        const a = await call(url, ID.search, { q: 'lantern', limit: 1 }).catch(e => ({ status: 0, body: { e: { code: e.message } } }))
        polls.push({ status: a.status, code: a.body?.e?.code, title: a.body?.v?.[0]?.title, lang: a.body?.v?.[0]?.lang })
        await sleep(10)
      }
    })()
    await check('dev: the first request works, after one build', () => ({ firstMs }))

    await check('dev: a crate edit reloads with no failed request', async () => {
      polls.length = 0
      const t = performance.now()
      writeFileSync(main, cleanMain.replace('title: doc.title.clone(), score', 'title: format!("v2 {}", doc.title), score'))
      await until('the new binary', async () => polls.at(-1)?.title?.startsWith('v2 '), 120_000)
      const ms = Math.round(performance.now() - t)
      await sleep(300)
      const bad = polls.filter(p => p.status !== 200)
      eq(bad, [], 'failed polls during the reload')
      return { reloadMs: ms, requests: polls.length }
    })

    await check('dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers', async () => {
      writeFileSync(docs, cleanDocs.replace("score: z.number() })", "score: z.number(), lang: z.string() })"))
      const said = `R103 error: \`${ID.search}\`: the Rust no longer matches the contract`
      await until('R103 from cargo in the log', async () => output.includes(said), 120_000)
      const noted = output.slice(output.indexOf(said)).split('\n')[0]
      writeFileSync(main, cleanMain.replace('title: doc.title.clone(), score: (s * 1e6).round() / 1e6 }', 'title: doc.title.clone(), score: (s * 1e6).round() / 1e6, lang: "en".to_string() }'))
      await until('the fixed sidecar', async () => polls.at(-1)?.lang === 'en', 120_000)
      return { noted: noted.slice(0, 140) }
    })

    await check('dev: a crash restarts the sidecar', async () => {
      const addr = [...output.matchAll(/search: listening on (\S+)/g)].at(-1)[1]
      const { pid } = await (await fetch(`http://${addr}/_weft/health`)).json()
      polls.length = 0
      process.kill(pid, 'SIGKILL')
      await until('a failure', async () => polls.some(p => p.status !== 200), 5000)
      polls.length = 0
      await until('a success', async () => polls.at(-1)?.status === 200, 30_000)
    })
  } finally {
    polling = false
    writeFileSync(docs, cleanDocs)
    writeFileSync(main, cleanMain)
    const addr = [...output.matchAll(/search: listening on (\S+)/g)].at(-1)?.[1]
    try { process.kill(-child.pid, 'SIGINT') } catch {}
    await Promise.race([new Promise(ok => child.on('close', ok)), sleep(8000)])
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await check('stopping `weft dev` stops the sidecar', async () => {
      ok(addr, 'never listened')
      await until('the port to close', async () => {
        try { await fetch(`http://${addr}/_weft/health`); return false } catch { return true }
      }, 5000)
    })
  }
}

// ---- report ---------------------------------------------------------------------------------------------------------

const passed = checks.filter(c => c.ok).length
const failed = checks.filter(c => !c.ok)
const result = {
  date: new Date().toISOString().slice(0, 10), ok: !failed.length, docs: Number(values.docs), runtimes, changed, speed, checks,
  sizes: existsSync(join(dir, '.output/rust/manifest.json')) ? JSON.parse(readFileSync(join(dir, '.output/rust/manifest.json'), 'utf8')) : {},
}
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results/phase5a-exit.json'), JSON.stringify(result, null, 2) + '\n')
const speedRows = Object.entries(speed).flatMap(([r, s]) => [`| ${r} | TS \`run\` | ${s.ts.p50} | ${s.ts.p99} | ${s.ts.perSecond} |`, `| ${r} | Rust sidecar | ${s.rust.p50} | ${s.rust.p99} | ${s.rust.perSecond} |`])
writeFileSync(join(here, 'results/phase5a-exit.md'), `# Phase 5a exit check

${result.date}: **${failed.length ? 'FAIL' : 'PASS'}**, ${passed} of ${checks.length} checks. A search sidecar replaces a TS \`query\` with no client change.
The swap is scripted (\`evals/phase5a-exit.mjs\`, the app in \`evals/phase5a/\`), not done by an agent. ${result.docs} documents; \`weft start\` on ${runtimes.join(', ')}.

Changed under \`src/\`: ${changed.map(f => `\`${f}\``).join(', ')}. Added: \`crates/search\`.

| Check | Result | Detail |
|---|---|---|
${checks.map(c => `| ${c.name} | ${c.ok ? 'pass' : `**FAIL**: ${String(c.error).split('\n')[0].slice(0, 160).replaceAll('|', '\\|')}`} | ${c.detail ? `\`${JSON.stringify(c.detail).slice(0, 110).replaceAll('|', '\\|')}\`` : ''} |`).join('\n')}

## Speed

The same tf-idf search over one corpus, through the public \`GET /_weft/fn/<id>\`, on one machine. Sequential p50 and p99, then 32 callers at once.
A within-weft comparison of two server bodies: the \`evals/compare\` stacks have no server functions, so they have no counterpart.

| Runtime | Body | p50 ms | p99 ms | calls/s |
|---|---|---|---|---|
${speedRows.join('\n')}
`)
log(`${failed.length ? 'FAIL' : 'PASS'}: ${passed}/${checks.length}`)
for (const f of failed) log(`  ${f.name}: ${String(f.error).slice(0, 300)}`)
process.exit(failed.length ? 1 : 0)
