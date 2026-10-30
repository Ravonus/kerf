#!/usr/bin/env node
// The Surfaces exit check (PLAN §9, "2. Surfaces"; research 33 §10): an agent adds a surface to a page from a one-line
// request. The Keel half is `npm run test:e2e` in packages/plugin-surface-keel.
//
//   node evals/surfaces-exit.mjs prepare <dir>     scaffold and install; prints the request
//   (a fresh agent works in <dir>, from the request and what the app ships, and sees no e2e)
//   node evals/surfaces-exit.mjs verify <dir>      weft check, tsc, build, then the hidden checks in Chrome
//
// verify writes evals/results/surfaces-exit.md and .json; exit 1 if any part fails. Needs packages/weft's native compiler.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const [step, dirArg] = process.argv.slice(2)
if (!['prepare', 'verify'].includes(step) || !dirArg) { console.error('usage: surfaces-exit.mjs prepare|verify <dir>'); process.exit(1) }
const dir = resolve(dirArg)
const run = (cmd, args, cwd = dir) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })
const must = (cmd, args, cwd) => {
  const r = run(cmd, args, cwd)
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`)
  return r
}

export const REQUEST = 'Add an animated starfield to the home page, with a slider that sets how dense it is.'

if (step === 'prepare') {
  must('node', [join(repo, 'packages/create-weft/bin/create-weft.mjs'), dir, '--ui', 'warp', '--name', 'stars'], repo)
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name of Object.keys(deps ?? {})) if (name === 'weft' || name.startsWith('@weft/')) deps[name] = `file:${join(repo, 'packages', name.replace('@weft/', ''))}`
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  must('npm', ['install', '--no-audit', '--no-fund'])
  must('npx', ['weft', 'agents-md'])
  console.log(REQUEST)
  process.exit(0)
}

const parts = {}
const check = JSON.parse(run('npx', ['weft', 'check', '--json']).stdout || '{}')
parts.check = { ok: check.ok === true, summary: check.summary, diagnostics: (check.diagnostics ?? []).map(d => `${d.code} ${d.file}:${d.span?.[0] ?? ''}`) }

writeFileSync(join(dir, 'tsconfig.check.json'), JSON.stringify({ extends: './tsconfig.json', compilerOptions: { preserveSymlinks: true }, include: ['src'] }, null, 2))
const tsc = run(join(repo, 'packages/weft/node_modules/.bin/tsc'), ['--noEmit', '-p', 'tsconfig.check.json'])
const errors = `${tsc.stdout}`.split('\n').filter(l => /error TS/.test(l))
const own = errors.filter(l => l.startsWith('src/'))
parts.types = { ok: !own.length, app: own, packages: errors.length - own.length }

const built = run('npx', ['weft', 'build'])
parts.build = { ok: built.status === 0 }
if (!parts.build.ok) console.error(built.stdout.slice(-3000), built.stderr.slice(-2000))

const { chromium } = createRequire(join(repo, 'packages/text-engine/package.json'))('playwright-core')
const port = 4300 + Math.floor(Math.random() * 500)
const server = spawn('npx', ['weft', 'start'], { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore', detached: true })
const url = `http://127.0.0.1:${port}/`
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(url)).ok) break } catch {}
  await new Promise(r => setTimeout(r, 200))
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const checks = []
const ok = (name, pass, detail = '') => checks.push({ name, ok: !!pass, detail: String(detail) })
try {
  const html = await (await fetch(url)).text()
  ok('the server renders a sized host and no canvas', /data-surface=/.test(html) && /aspect-ratio|height/.test(html.match(/<[^>]*data-surface=[^>]*>/)?.[0] ?? '') && !/<canvas/.test(html))
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 })).newPage()
  const problems = []
  page.on('pageerror', e => problems.push(e.message))
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message|favicon|status of 404/.test(m.text())) problems.push(m.text()) })
  await page.goto(url, { waitUntil: 'networkidle' })
  const canvas = page.locator('[data-surface] canvas').first()
  await canvas.waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  const named = await canvas.evaluate(c => c.getAttribute('aria-label') || c.getAttribute('aria-hidden'))
  ok('the canvas is named, or decorative', named, named)

  const lit = async () => {
    const png = (await canvas.screenshot()).toString('base64')
    return page.evaluate(async b64 => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(bitmap.width, bitmap.height), x = c.getContext('2d', { willReadFrequently: true })
      x.drawImage(bitmap, 0, 0)
      const d = x.getImageData(0, 0, c.width, c.height).data, counts = new Map()
      for (let i = 0; i < d.length; i += 4) { const k = d[i] << 16 | d[i + 1] << 8 | d[i + 2]; counts.set(k, (counts.get(k) ?? 0) + 1) }
      const background = Math.max(...counts.values())
      return { colours: counts.size, lit: d.length / 4 - background, hash: [...counts].sort().slice(0, 40).join() }
    }, png)
  }
  const a = await lit()
  await page.waitForTimeout(300)
  const b = await lit()
  ok('it paints stars', a.colours > 1 && a.lit > 0, JSON.stringify({ colours: a.colours, lit: a.lit }))
  const png = async () => (await canvas.screenshot()).toString('base64')
  const s1 = await png(); await page.waitForTimeout(300); const s2 = await png()
  ok('it animates', s1 !== s2)

  const slider = page.getByRole('slider').first()
  ok('there is a slider, with a name', await slider.evaluate(s => s.getAttribute('aria-label') || s.labels?.[0]?.textContent || s.getAttribute('aria-labelledby')))
  const bounds = await slider.evaluate(s => [+(s.min || 0), +(s.max || 100)])
  const set = v => slider.evaluate((s, v) => { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })) }, v)
  await set(bounds[0])
  await page.waitForTimeout(300)
  const few = await lit()
  await set(bounds[1])
  await page.waitForTimeout(300)
  const many = await lit()
  ok('the slider changes the density', many.lit > few.lit, `${few.lit} → ${many.lit} lit pixels`)
  const quiet = await page.evaluate(async ([low, high]) => {
    const host = document.querySelector('[data-surface]'), canvas = host.querySelector('canvas')
    const records = []
    const seen = new MutationObserver(r => records.push(...r))
    seen.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
    const s = document.querySelector('input[type=range], [role=slider]')
    for (const v of [low, high, low, high]) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => requestAnimationFrame(r)) }
    seen.disconnect()
    return { mutations: records.length, same: host.querySelector('canvas') === canvas }
  }, bounds)
  ok('moving it touches nothing in the surface: the same canvas, 0 DOM writes', quiet.same && quiet.mutations === 0, JSON.stringify(quiet))
  ok('no errors or warnings in the console', !problems.length, problems.join(' | '))
} catch (error) {
  ok('the page could be driven', false, error.message.split('\n')[0])
} finally {
  await browser.close()
  try { process.kill(-server.pid) } catch {}
}
parts.e2e = { ok: checks.length > 0 && checks.every(c => c.ok), checks }

const ok_ = Object.values(parts).every(p => p.ok)
const result = { date: new Date().toISOString().slice(0, 10), ok: ok_, request: REQUEST, parts, kind: /kind:\s*'(\w+)'/.exec(run('grep', ['-rh', 'kind:', 'src']).stdout)?.[1] ?? null }
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results/surfaces-exit.json'), JSON.stringify(result, null, 2) + '\n')
writeFileSync(join(here, 'results/surfaces-exit.md'), `# Surfaces exit check

${result.date}: **${ok_ ? 'PASS' : 'FAIL'}**. \`create-weft --ui warp\`, then a fresh agent given one line, from the app and its docs:

> ${REQUEST}

Then the hidden checks in \`evals/surfaces-exit.mjs\`, against \`weft build\` + \`weft start\` in Chrome.

| Check | Result | Detail |
|---|---|---|
${checks.map(c => `| ${c.name} | ${c.ok ? 'pass' : 'FAIL'} | ${c.detail.replace(/\|/g, '\\|')} |`).join('\n')}

- \`weft check\`: ${parts.check.ok ? 'no errors' : 'errors'} (${JSON.stringify(parts.check.summary)}).
- \`tsc\` on the app: ${own.length} error(s) in \`src/\`, ${parts.types.packages} in linked packages.
- \`weft build\`: ${parts.build.ok ? 'ok' : 'FAILED'}.
- Surface kind the agent chose: ${result.kind ?? 'unknown'}.
`)
console.log(ok_ ? 'PASS' : 'FAIL', JSON.stringify({ check: parts.check.ok, types: parts.types.ok, build: parts.build.ok, e2e: checks.filter(c => !c.ok).map(c => c.name) }))
process.exit(ok_ ? 0 : 1)
