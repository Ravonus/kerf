#!/usr/bin/env node
// Style groups spike (research 23 §6): grade and measure the v3 shop styled two ways.
//   shop-css/     BEM classes + one hand-written stylesheet on warp's tokens (how it's done today)
//   shop-groups/  the same design as style groups (weft/style)
// For each: the hidden tests (evals/tasks-v3/shop/hidden) plus spike.test.tsx in evals/frameworks/weft, a production
// `vite build`, CSS bytes (min, gzip, brotli), and styling tokens per element. For the groups shop, the CSS is also
// emitted flat (no @scope) and atomic (one class per declaration), from the same definitions and call sites.
//
//   node spikes/style-groups/run.mjs            # writes spikes/style-groups/results.json and prints a summary
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const fwDir = join(repo, 'evals/frameworks/weft')
const hidden = join(repo, 'evals/tasks-v3/shop/hidden')
const starter = join(repo, 'evals/tasks-v3/shop/starter/weft')
const exec = promisify(execFile)
const req = createRequire(join(fwDir, 'package.json'))
const { JSDOM } = req('jsdom')
const { transform: minifyCss } = req('lightningcss')
const { transform } = req('weft/compiler')
const { emitGroups, emitAtomic } = await import(join(repo, 'packages/weft/src/style/css.ts'))

const sizes = css => {
  const min = minifyCss({ filename: 'x.css', code: Buffer.from(css), minify: true }).code
  return { raw: Buffer.byteLength(css), min: min.length, gz: gzipSync(min, { level: 9 }).length, br: brotliCompressSync(min).length }
}

async function grade(app) {
  const id = `spike-${app}-${process.pid}`
  const dir = join(fwDir, '.grade', id)
  rmSync(dir, { recursive: true, force: true })
  cpSync(join(here, app, 'src'), join(dir, 'src'), { recursive: true })
  for (const f of ['helpers.ts', 'baseline.test.tsx', 't1.test.tsx', 't2.test.tsx', 't3.test.tsx']) cpSync(join(hidden, f), join(dir, f))
  cpSync(join(here, 'spike.test.tsx'), join(dir, 'spike.test.tsx'))
  const report = join(dir, 'report.json')
  const spikeOut = join(dir, 'spike.json')
  try {
    try {
      await exec('npx', ['vitest', 'run', relative(fwDir, dir), '--reporter=json', `--outputFile=${report}`], { cwd: fwDir, timeout: 300_000, maxBuffer: 1 << 26, env: { ...process.env, SPIKE_OUT: spikeOut } })
    } catch {}
    const data = JSON.parse(readFileSync(report, 'utf8'))
    const tests = data.testResults.flatMap(f => f.assertionResults.map(a => ({ file: f.name.split('/').pop(), name: a.title, ok: a.status === 'passed', message: a.failureMessages?.[0]?.split('\n')[0] })))
    const hiddenTests = tests.filter(t => t.file !== 'spike.test.tsx')
    return {
      hidden: { passed: hiddenTests.filter(t => t.ok).length, total: hiddenTests.length },
      spike: tests.filter(t => t.file === 'spike.test.tsx'),
      failures: tests.filter(t => !t.ok),
      measured: existsSync(spikeOut) ? JSON.parse(readFileSync(spikeOut, 'utf8')) : null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function build(app) {
  const dir = join(tmpdir(), `weft-style-spike-${app}-${process.pid}`)
  rmSync(dir, { recursive: true, force: true })
  cpSync(starter, dir, { recursive: true })
  cpSync(join(here, app, 'src'), join(dir, 'src'), { recursive: true })
  symlinkSync(join(fwDir, 'node_modules'), join(dir, 'node_modules'))
  try {
    await exec('npx', ['vite', 'build', '--logLevel', 'silent'], { cwd: dir, timeout: 300_000 })
    const assets = join(dir, 'dist/assets')
    const read = ext => readdirSync(assets).filter(f => f.endsWith(ext)).map(f => readFileSync(join(assets, f), 'utf8')).join('')
    const js = read('.js')
    return { css: read('.css'), jsGz: gzipSync(js, { level: 9 }).length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The groups shop's definitions and call sites, straight from the compiler (what the Vite plugin collects). */
function groupFacts(app) {
  const src = join(here, app, 'src')
  const files = []
  const walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(join(d, e.name))))
  walk(src)
  const defs = new Map(files.map(f => [f, transform(readFileSync(f, 'utf8'), { filename: f, checkOnly: true }).facts.groups]))
  const groups = [...defs].flatMap(([f, gs]) => gs.map(g => ({ ...g, file: relative(repo, f) })))
  const uses = []
  for (const f of files) {
    const code = readFileSync(f, 'utf8')
    const opts = {}
    for (const [, names, spec] of code.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const base = resolve(dirname(f), spec)
      const target = ['.tsx', '.ts'].map(e => base + e).find(existsSync)
      for (const g of defs.get(target) ?? []) if (names.split(',').some(n => n.trim() === g.binding)) opts[`${base}#${g.binding}`] = { name: g.name, def: g.def }
    }
    const out = transform(code, { filename: f, checkOnly: true, groups: opts })
    if (out.diagnostics.some(d => d.severity === 'error')) throw new Error(`${f}: ${JSON.stringify(out.diagnostics)}`)
    uses.push(...out.facts.groupUses.map(u => ({ ...u, file: relative(repo, f) })))
  }
  return { groups, uses }
}

/** Styling tokens per styled element: class names, group attributes, or the atoms an atomic emitter would apply. */
function perElement(html, count) {
  const { document } = new JSDOM(`<body>${html}</body>`).window
  const n = [...document.body.querySelectorAll('*')].map(count).filter(x => x > 0)
  return { elements: n.length, mean: +(n.reduce((a, b) => a + b, 0) / (n.length || 1)).toFixed(2), max: Math.max(0, ...n), total: n.reduce((a, b) => a + b, 0) }
}

const results = {}
if (process.argv.includes('--css')) {
  const facts = groupFacts('shop-groups')
  const hand = sizes(readFileSync(join(here, 'shop-css/src/shop.css'), 'utf8'))
  console.log('hand', JSON.stringify(hand))
  for (const scope of [true, false]) for (const where of [true, false]) for (const share of [true, false]) {
    const s = sizes(emitGroups(facts.groups, facts.uses, { scope, where, share }))
    console.log(JSON.stringify({ scope, where, share }), JSON.stringify(s), `br ${((s.br / hand.br - 1) * 100).toFixed(1)}%`)
  }
  for (const where of [true, false]) {
    const s = sizes(emitGroups(facts.groups, facts.uses, { bareParts: true, where }))
    console.log(JSON.stringify({ bareParts: true, where }), JSON.stringify(s), `br ${((s.br / hand.br - 1) * 100).toFixed(1)}%`)
  }
  console.log('atomic', JSON.stringify(sizes(emitAtomic(facts.groups, facts.uses).css())))
  mkdirSync(join(here, 'out'), { recursive: true })
  writeFileSync(join(here, 'out/groups.bare.css'), emitGroups(facts.groups, facts.uses, { bareParts: true, dev: true }))
  process.exit(0)
}
for (const app of ['shop-css', 'shop-groups']) {
  console.log(`${app}: grading…`)
  const [g, b] = await Promise.all([grade(app), build(app)])
  results[app] = { hidden: g.hidden, spike: g.spike.map(t => `${t.ok ? 'pass' : 'FAIL'} ${t.name}${t.ok ? '' : ': ' + t.message}`), failures: g.failures, measured: g.measured, css: sizes(b.css), jsGz: b.jsGz }
}

const facts = groupFacts('shop-groups')
const dev = emitGroups(facts.groups, facts.uses, { dev: true })
const flat = emitGroups(facts.groups, facts.uses, { scope: false })
const atomic = emitAtomic(facts.groups, facts.uses)
writeFileSync(join(here, 'out/groups.dev.css'), dev)
writeFileSync(join(here, 'out/groups.flat.css'), emitGroups(facts.groups, facts.uses, { dev: true, scope: false }))
writeFileSync(join(here, 'out/atomic.css'), atomic.css())
const handCss = readFileSync(join(here, 'shop-css/src/shop.css'), 'utf8')
results.css = {
  'hand (shop-css build)': results['shop-css'].css,
  'groups, @scope (shop-groups build)': results['shop-groups'].css,
  'groups, @scope (emitter, prod)': sizes(emitGroups(facts.groups, facts.uses)),
  'groups, flat :where (emitter, prod)': sizes(flat),
  'atomic (emitter)': sizes(atomic.css()),
  'groups, all values (no call-site pruning)': sizes(emitGroups(facts.groups, facts.groups.map(g => ({ group: g.name, axes: {}, states: [], part: null, dynamic: true })).concat(facts.uses.filter(u => u.part)))),
}
results.handCssSource = sizes(handCss)
results.groupCount = facts.groups.length
results.useCount = facts.uses.length

const groupAttrs = el => {
  const g = el.getAttribute('data-g')
  if (!g) return 0
  const def = facts.groups.find(x => x.name === g)?.def ?? {}
  const axes = Object.keys(def.axes ?? {})
  const states = Object.keys(def.states ?? {})
  return [...el.attributes].filter(a => a.name === 'data-g' || a.name === 'data-part' || axes.some(x => a.name === `data-${x}`) || states.some(s => a.name === `aria-${s}` || a.name === `data-${s}`)).length
}
const classes = el => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).length
const atoms = el => (el.getAttribute('data-g') ? atomic.atoms(el).size : 0)
results.perElement = {}
for (const view of ['catalog', 'cart']) {
  results.perElement[view] = {
    'hand CSS: classes': perElement(results['shop-css'].measured?.[view] ?? '', classes),
    'groups: attributes': perElement(results['shop-groups'].measured?.[view] ?? '', groupAttrs),
    'atomic: classes': perElement(results['shop-groups'].measured?.[view] ?? '', atoms),
  }
}
for (const app of ['shop-css', 'shop-groups']) for (const v of ['catalog', 'cart']) delete results[app].measured?.[v]
writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
