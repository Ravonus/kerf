#!/usr/bin/env node
// Phase 2's exit check (PLAN §9, "2. UI (warp tier 1)"): the v3 shop rebuilt on weft + warp passes its hidden tests
// within the §3.7 budget plus a measured kit allowance; contrast and a11y suites green at every dial stop.
//
//   node warp-exit.mjs [--name v3-warp-exit] [--skip-a11y]
//
// Needs `npm install` in frameworks/warp, frameworks/weft, packages/warp and packages/warp-core, and a fresh native
// compiler (packages/weft: npm run build:native). Parts, each pass/fail:
//   hidden    run-app.mjs reference + grade + measure on reference-v3/{warp,weft}: every hidden test, and the §3.7
//             work budgets on the probe (price-push ≤ 1 DOM and ≤ 10 re-runs, add-one ≤ 3 DOM)
//   size      both shops built for production, brotli q11: warp's JS ≤ the §3.7 app budget + KIT_ALLOWANCE, and JS + CSS
//             under the 50 KB ceiling. The kit is warp's JS minus the weft shop's.
//   contrast  warp-core's copy of the spec checker on the resolved tokens: every text/UI/focus pair at light/dark ×
//             quiet/balanced/vivid (motion doesn't touch colour tokens; the a11y part covers it in the page)
//   a11y      packages/warp/scripts/a11y.mjs on the warp gallery (every component) and the built shop: axe plus
//             pixel-measured contrast at all 12 stops, expression × theme × motion
// Writes results/<name>/exit.json and exit.md; exit 1 if any part fails.
import { execFile } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompressSync, constants } from 'node:zlib'

const root = dirname(fileURLToPath(import.meta.url))
const repo = join(root, '..')
const exec = promisify(execFile)
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const name = arg('name', 'v3-warp-exit')
const out = join(root, 'results', name)
const log = (...a) => console.error(...a)
const br = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

// §3.7: the v3 shop's total JS. The kit allowance is set from the 2026-10-29 measurement (warp adds 6,280–6,426 B br of JS to
// the weft shop: the field shell, the sweep machine, Button/Toggle/Select/Badge/Skeleton and their spread helpers) plus the
// 4.42 KB of a Select warp draws on every device (redesign §6), rounded up to 11 KB so a byte-level change doesn't flip the
// gate; a bigger jump should be looked at, not absorbed.
const APP_BUDGET = 10 * 1024
export const KIT_ALLOWANCE = 11 * 1024
const CEILING = 50 * 1024

const results = {}

// -- hidden tests and work budgets
{
  log('== hidden tests (run-app.mjs, reference-v3/warp and /weft)')
  const run = async (cmd) =>
    (
      await exec('node', ['run-app.mjs', cmd, '--name', name, '--frameworks', 'warp,weft'], {
        cwd: root,
        timeout: 900_000,
        maxBuffer: 1 << 26,
      })
    ).stdout
  await run('reference')
  log((await run('grade')).trim())
  await run('measure')
  const grades = JSON.parse(readFileSync(join(out, 'grades.json'), 'utf8'))
  const measure = JSON.parse(readFileSync(join(out, 'measure.json'), 'utf8'))
  const tally = (g) =>
    Object.values(g.byFile).reduce((a, f) => [a[0] + f.passed, a[1] + f.total], [0, 0])
  const [passed, total] = tally(grades['warp/t3'])
  const [weftPassed, weftTotal] = tally(grades['weft/t3'])
  const p = measure.warp.probe
  const budgets = {
    'price-push DOM ≤ 1': p['price-push'].domMutations <= 1,
    'price-push re-runs ≤ 10': p['price-push'].commits !== null && p['price-push'].commits <= 10,
    'add-one DOM ≤ 3': p['add-one'].domMutations <= 3,
  }
  results.hidden = {
    ok: passed === total && total > 0 && Object.values(budgets).every(Boolean),
    warp: `${passed}/${total}`,
    weft: `${weftPassed}/${weftTotal}`,
    probe: { warp: p, weft: measure.weft.probe },
    budgets,
    failures: grades['warp/t3'].failures,
  }
  log(
    `   warp ${results.hidden.warp} (weft ${results.hidden.weft}); budgets ${JSON.stringify(budgets)}`,
  )
}

// -- size
const builds = {}
{
  log('== size (production builds, brotli q11)')
  const work = mkdtempSync(join(tmpdir(), 'warp-exit-'))
  for (const fw of ['warp', 'weft']) {
    const dir = join(work, fw)
    cpSync(join(root, 'tasks-v3', 'shop', 'starter', fw), dir, {
      recursive: true,
      filter: (f) => !f.includes('/src') && !f.includes('/tests'),
    })
    cpSync(join(root, 'reference-v3', fw, 'src'), join(dir, 'src'), { recursive: true })
    symlinkSync(join(root, 'frameworks', fw, 'node_modules'), join(dir, 'node_modules'))
    await exec('npx', ['vite', 'build', '--logLevel', 'silent'], { cwd: dir, timeout: 300_000 })
    const assets = join(dir, 'dist', 'assets')
    const sum = (ext) =>
      readdirSync(assets)
        .filter((f) => f.endsWith(ext))
        .reduce((s, f) => s + br(readFileSync(join(assets, f))), 0)
    builds[fw] = { dist: join(dir, 'dist'), js: sum('.js'), css: sum('.css') }
  }
  const kit = builds.warp.js - builds.weft.js
  const jsBudget = APP_BUDGET + KIT_ALLOWANCE
  results.size = {
    ok: builds.warp.js <= jsBudget && builds.warp.js + builds.warp.css <= CEILING,
    warp: { js: builds.warp.js, css: builds.warp.css },
    weft: { js: builds.weft.js, css: builds.weft.css },
    kit,
    budget: { app: APP_BUDGET, kitAllowance: KIT_ALLOWANCE, js: jsBudget, ceiling: CEILING },
    weftWithinAppBudget: builds.weft.js <= APP_BUDGET,
  }
  log(
    `   warp JS ${builds.warp.js} B (weft ${builds.weft.js} + kit ${kit}) ≤ ${jsBudget}; CSS ${builds.warp.css} B; JS + CSS ${builds.warp.js + builds.warp.css} ≤ ${CEILING}`,
  )
  results.size.work = work
}

// -- token contrast
{
  log('== contrast (resolved tokens, spec checker)')
  const checker = join(repo, 'packages', 'warp-core', 'scripts', 'contrast-check.mjs')
  const css = join(repo, 'packages', 'warp-core', 'styles', 'warp.css')
  let stdout
  try {
    ;({ stdout } = await exec('node', [checker, css, '--json'], { maxBuffer: 1 << 26 }))
  } catch (e) {
    stdout = e.stdout
  }
  const { results: pairs } = JSON.parse(stdout)
  const combos = {}
  for (const r of pairs) {
    const c = (combos[r.combo] ??= { pass: 0, fail: 0 })
    r.pass ? c.pass++ : c.fail++
  }
  const failures = pairs.filter((r) => !r.pass)
  results.contrast = {
    ok: failures.length === 0 && pairs.length > 0,
    checks: pairs.length,
    combos,
    failures,
  }
  log(`   ${pairs.length} checks, ${failures.length} failures`)
}

// -- a11y at every dial stop
if (!process.argv.includes('--skip-a11y')) {
  log('== a11y (axe + measured contrast, 12 stops)')
  const { a11y, buildGallery, DIALS, scenes } = await import(
    join(repo, 'packages', 'warp', 'scripts', 'a11y.mjs')
  )
  const gallery = await buildGallery(join(results.size.work, 'gallery'))
  // The audit sets the dials from outside the build, so the shop's audited copy keeps the tiers its size build drops.
  const shop = join(results.size.work, 'warp')
  writeFileSync(
    join(shop, 'vite.audit.ts'),
    `import weft from '@weft-js/core/vite'\nexport default { plugins: [weft({ purge: { keep: ${JSON.stringify(DIALS)} } })] }\n`,
  )
  await exec(
    'npx',
    [
      'vite',
      'build',
      '--logLevel',
      'silent',
      '--config',
      'vite.audit.ts',
      '--outDir',
      'dist-audit',
    ],
    { cwd: shop, timeout: 300_000 },
  )
  const r = await a11y(
    [
      { name: 'gallery', dir: gallery },
      { name: 'charts', dir: gallery },
      ...Object.keys(scenes).map((scene) => ({ name: scene, dir: gallery })),
      { name: 'shop', dir: join(shop, 'dist-audit') },
    ],
    { log: (l) => log(`   ${l}`) },
  )
  const failures = r.results.flatMap((run) => [
    ...run.errors.map((e) => ({
      site: run.site,
      stop: `${run.expression}/${run.theme}/${run.motion}`,
      error: e,
    })),
    ...run.states.flatMap((s) =>
      [
        ...s.violations.map((v) => ({ id: v.id, nodes: v.nodes })),
        ...s.moving.map((m) => ({ id: 'moving at reduce', nodes: [{ target: m }] })),
      ].map((v) => ({
        site: run.site,
        stop: `${run.expression}/${run.theme}/${run.motion}`,
        state: s.label,
        ...v,
      })),
    ),
  ])
  results.a11y = {
    ok: r.ok,
    runs: r.runs,
    audits: r.audits,
    measured: r.measured,
    specFindings: r.spec,
    failures,
  }
  for (const f of r.spec)
    log(`   spec finding ${f.where} (${f.theme}, ${f.stops.length} runs): ${f.why}`)
  log(
    `   ${r.runs} runs, ${r.audits} audits, ${r.measured} measured contrasts, ${failures.length} failures`,
  )
}
rmSync(results.size.work, { recursive: true, force: true })
delete results.size.work

const ok = Object.values(results).every((r) => r.ok)
mkdirSync(out, { recursive: true })
writeFileSync(
  join(out, 'exit.json'),
  JSON.stringify({ ok, date: new Date().toISOString(), ...results }, null, 2),
)
const kb = (b) => `${(b / 1024).toFixed(2)} KB`
const md = [
  `# ${name}: Phase 2 exit check`,
  '',
  `| part | result | |`,
  '|---|---|---|',
  `| hidden tests | ${results.hidden.ok ? 'pass' : 'FAIL'} | warp ${results.hidden.warp} (weft ${results.hidden.weft}); price-push ${results.hidden.probe.warp['price-push'].domMutations} DOM / ${results.hidden.probe.warp['price-push'].commits} re-runs, add-one ${results.hidden.probe.warp['add-one'].domMutations} DOM |`,
  `| size | ${results.size.ok ? 'pass' : 'FAIL'} | JS ${kb(results.size.warp.js)} br = weft shop ${kb(results.size.weft.js)} + kit ${kb(results.size.kit)}; budget ${kb(results.size.budget.app)} + kit allowance ${kb(KIT_ALLOWANCE)}; CSS ${kb(results.size.warp.css)} |`,
  `| token contrast | ${results.contrast.ok ? 'pass' : 'FAIL'} | ${results.contrast.checks} pairs over ${Object.keys(results.contrast.combos).length} theme × expression stops, ${results.contrast.failures.length} failures |`,
  ...(results.a11y
    ? [
        `| a11y | ${results.a11y.ok ? 'pass' : 'FAIL'} | ${results.a11y.runs} runs, ${results.a11y.audits} axe audits, ${results.a11y.measured} pixel-measured contrasts, ${results.a11y.failures.length} failures; ${results.a11y.specFindings.length} spec findings reported |`,
      ]
    : []),
  '',
  ...(results.a11y?.specFindings ?? []).map(
    (f) => `- spec finding \`${f.where}\` (${f.theme}, ${f.stops.length} runs): ${f.why}`,
  ),
  ...(results.a11y?.failures ?? [])
    .slice(0, 40)
    .map(
      (f) =>
        `- FAIL ${f.site} ${f.stop} ${f.state ?? ''} ${f.id ?? ''} ${f.error ?? (f.nodes ?? []).map((n) => `${n.target} ${n.why ?? ''}`).join('; ')}`,
    ),
]
writeFileSync(join(out, 'exit.md'), md.join('\n') + '\n')
console.log(md.join('\n'))
process.exit(ok ? 0 : 1)
