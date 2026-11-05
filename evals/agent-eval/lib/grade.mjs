// Hidden tests against the running app. Works on a clone so a build can't touch what the agent is still working on, and
// builds and serves inside the same box, because this is agent-written code. Tests and measures run outside it.
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'
import { here } from './paths.mjs'
import { boxed, env } from './sandbox.mjs'

const axe = readFileSync(join(here, 'node_modules/axe-core/axe.min.js'), 'utf8')
const run = promisify(execFile)
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

/** A second box the agent never sees, holding a clone of its app. */
export function cloneForGrading(box, n) {
  const root = `${box.root}-grade${n}`
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const copy = { root, app: join(root, 'app'), home: join(root, 'home'), tmp: join(root, 'tmp') }
  mkdirSync(copy.home)
  mkdirSync(copy.tmp)
  // Clones, and symlinks stay symlinks: a built app has to resolve the way it did for the agent.
  return run('/bin/cp', ['-cRP', box.app, copy.app]).then(() => copy)
}

export async function build(copy, stack) {
  for (const d of stack.built) rmSync(join(copy.app, d), { recursive: true, force: true })
  const environment = stack.calibrationPnpm
    ? env(copy, {
        PATH: `${join(copy.app, '.calibration-bin')}:${env(copy).PATH}`,
        npm_config_verify_deps_before_run: 'false',
        FORCE_COLOR: '0',
      })
    : env(copy)
  const [cmd, argv] = boxed(copy, 'pnpm', ['run', 'build'])
  const at = Date.now()
  try {
    if (stack.calibrationPnpm) {
      const [typeCmd, typeArgs] = boxed(copy, 'pnpm', ['run', 'typecheck'])
      await run(typeCmd, typeArgs, {
        cwd: copy.app,
        env: environment,
        timeout: 300_000,
        maxBuffer: 1 << 26,
      })
    }
    await run(cmd, argv, { cwd: copy.app, env: environment, timeout: 300_000, maxBuffer: 1 << 26 })
    return { ok: true, ms: Date.now() - at }
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - at,
      error: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.slice(-16000),
    }
  }
}

export async function serve(copy, stack) {
  const port = await freePort()
  const argv0 = stack.serve.map((a) => a.replace('{port}', port))
  const [cmd, argv] = boxed(copy, argv0[0], argv0.slice(1))
  const child = spawn(cmd, argv, {
    cwd: copy.app,
    env: env(copy, {
      PORT: String(port),
      HOST: '127.0.0.1',
      ...(stack.calibrationPnpm
        ? { PATH: `${join(copy.app, '.calibration-bin')}:${env(copy).PATH}` }
        : {}),
    }),
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
  const base = `http://127.0.0.1:${port}`
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  for (const end = Date.now() + 30_000; Date.now() < end;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).status < 500)
        return { base, stop }
    } catch {}
    await new Promise((r) => {
      setTimeout(r, 200)
    })
  }
  stop()
  throw new Error(`server never answered: ${output.slice(-800)}`)
}

/** Run a task's hidden tests, each in a fresh browser context. A failure gets one rerun, and a flake is recorded as one. */
export async function hidden(task, base) {
  const { tests } = await import(pathToFileURL(join(here, 'tasks', task, 'hidden.mjs')).href)
  const browser = await chromium.launch()
  const once = async (t) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    ctx.setDefaultTimeout(5000)
    const page = await ctx.newPage()
    const problems = []
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text())
    })
    page.on('pageerror', (e) => problems.push(e.message))
    let timer
    try {
      await Promise.race([
        t.run({ page, base, problems }),
        new Promise((_, no) => {
          timer = setTimeout(() => no(new Error('test timed out')), 30_000)
        }),
      ])
      return null
    } catch (e) {
      return String(e.message).slice(0, 2000)
    } finally {
      clearTimeout(timer)
      await ctx.close()
    }
  }
  const results = []
  for (const t of tests) {
    let failure = await once(t),
      flaky = false
    if (failure) {
      const again = await once(t)
      flaky = !again
      if (flaky) failure = null
    }
    results.push({ title: t.title, ok: !failure, failure, flaky })
  }
  await browser.close()
  return {
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    flaky: results.filter((r) => r.flaky).length,
    failed: results.filter((r) => !r.ok),
  }
}

/** Quality of the final app: bytes on the wire for `/`, axe, an interaction timing from the task, lines changed. */
export async function quality(task, base, copy, golden) {
  const { interaction } = await import(pathToFileURL(join(here, 'tasks', task, 'hidden.mjs')).href)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const bytes = { html: { raw: 0, gz: 0 }, js: { raw: 0, gz: 0 }, css: { raw: 0, gz: 0 } }
  const waits = []
  page.on('response', (r) =>
    waits.push(
      (async () => {
        const type = r.headers()['content-type'] ?? '',
          kind = /javascript/.test(type)
            ? 'js'
            : /css/.test(type)
              ? 'css'
              : /html/.test(type)
                ? 'html'
                : null // the document counts: inlined JS and CSS are still bytes
        if (!kind) return
        const body = await r.body().catch(() => null)
        if (body) {
          bytes[kind].raw += body.length
          bytes[kind].gz += gzipSync(body, { level: 9 }).length
        }
      })(),
    ),
  )
  await page.goto(base, { waitUntil: 'networkidle' })
  await Promise.all(waits)
  await page.addScriptTag({ content: axe })
  const a11y = await page.evaluate(async () =>
    (await window.axe.run()).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  )
  let timing
  try {
    timing = interaction ? await interaction(page, base) : null
  } catch (e) {
    timing = { error: e.message.slice(0, 200) }
  }
  await browser.close()
  return {
    bytes,
    a11y,
    timing,
    lines: changedLines(golden, copy.app),
    lighthouse: await lighthouse(base),
  }
}

async function lighthouse(url) {
  const script = join(here, '../../examples/lib/lighthouse-run.mjs')
  if (!existsSync(join(here, '../../examples/node_modules/lighthouse')))
    return { skipped: 'install examples with pnpm first' }
  try {
    const { stdout } = await run(
      process.execPath,
      [script, JSON.stringify({ url, formFactor: 'mobile', chrome: chromium.executablePath() })],
      { maxBuffer: 1 << 26, timeout: 120_000 },
    )
    const { score, fcp, lcp, tbt, cls } = JSON.parse(stdout)
    return { score, fcp, lcp, tbt, cls }
  } catch (e) {
    return { error: e.message.slice(0, 200) }
  }
}

const SKIP = new Set([
  'node_modules',
  '.next',
  'dist',
  '.output',
  '.weft',
  '.git',
  'package-lock.json',
  'next-env.d.ts',
])
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|wasm)$/
function sources(root, dir = root, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.isSymbolicLink()) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(root, p, out)
    else if (!BINARY.test(e.name)) out.set(relative(root, p), readFileSync(p, 'utf8').split('\n'))
  }
  return out
}
/** Lines added and removed against the scaffold, as multisets per file, generated files out. */
function changedLines(a, b) {
  const was = sources(a),
    now = sources(b)
  let added = 0,
    removed = 0,
    files = 0
  for (const name of new Set([...was.keys(), ...now.keys()])) {
    const left = new Map()
    for (const l of was.get(name) ?? []) left.set(l, (left.get(l) ?? 0) + 1)
    let plus = 0
    for (const l of now.get(name) ?? []) {
      const n = left.get(l) ?? 0
      if (n) left.set(l, n - 1)
      else plus++
    }
    const minus = [...left.values()].reduce((x, y) => x + y, 0)
    if (plus || minus) {
      added += plus
      removed += minus
      files++
    }
  }
  return { added, removed, files }
}
