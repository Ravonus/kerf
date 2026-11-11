#!/usr/bin/env node
// Phase 2's exit check (PLAN §9, "2. UI (veneer tier 1)"): the v3 shop rebuilt on kerf + veneer passes its hidden tests
// within the §3.7 budget plus a measured kit allowance; contrast and a11y suites green at every dial stop.
//
//   node veneer-exit.mjs [--name v3-veneer-exit] [--skip-a11y]
//
// Needs `npm install` in frameworks/veneer, frameworks/kerf, packages/veneer and packages/veneer-core, and a fresh native
// compiler (packages/core: npm run build:native). Parts, each pass/fail:
//   hidden    run-app.mjs reference + grade + measure on reference-v3/{veneer,kerf}: every hidden test, and the §3.7
//             work budgets on the probe (price-push ≤ 1 DOM and ≤ 10 re-runs, add-one ≤ 3 DOM)
//   size      both shops built for production, brotli q11: veneer's JS ≤ the §3.7 app budget + KIT_ALLOWANCE, and JS + CSS
//             under the 50 KB ceiling. The kit is veneer's JS minus the kerf shop's.
//   contrast  veneer-core's copy of the spec checker on the resolved tokens: every text/UI/focus pair at light/dark ×
//             quiet/balanced/vivid (motion doesn't touch colour tokens; the a11y part covers it in the page)
//   a11y      packages/veneer/scripts/a11y.mjs on the veneer gallery (every component) and the built shop: axe plus
//             pixel-measured contrast at all 12 stops, expression × theme × motion
// Writes results/<name>/exit.json and exit.md; exit 1 if any part fails.
import { repoRoot } from '../../scripts/lib/helpers.mjs'
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = repoRoot
const exec = promisify(execFile)
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const name = arg('name', 'v3-veneer-exit')
const out = join(root, 'results', name)
const log = (...a) => console.error(...a)
const br = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

// §3.7: the v3 shop's total JS. The kit allowance is set from the 2026-10-29 measurement (veneer adds 6,280–6,426 B br of JS to
// the kerf shop: the field shell, the sweep machine, Button/Toggle/Select/Badge/Skeleton and their spread helpers) plus the
// 4.42 KB of a Select veneer draws on every device (redesign §6), rounded up to 11 KB so a byte-level change doesn't flip the
// gate; a bigger jump should be looked at, not absorbed.
const APP_BUDGET = 10 * 1024
export const KIT_ALLOWANCE = 11 * 1024
const CEILING = 50 * 1024

const results = {}

// -- hidden tests and work budgets
{
  log('== hidden tests (run-app.mjs, reference-v3/veneer and /kerf)')
  const run = async (cmd) =>
    (
      await exec('node', ['run-app.mjs', cmd, '--name', name, '--frameworks', 'veneer,kerf'], {
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
  const [passed, total] = tally(grades['veneer/t3'])
  const [kerfPassed, kerfTotal] = tally(grades['kerf/t3'])
  const p = measure.veneer.probe
  const budgets = {
    'price-push DOM ≤ 1': p['price-push'].domMutations <= 1,
    'price-push re-runs ≤ 10': p['price-push'].commits !== null && p['price-push'].commits <= 10,
    'add-one DOM ≤ 3': p['add-one'].domMutations <= 3,
  }
  results.hidden = {
    ok: passed === total && total > 0 && Object.values(budgets).every(Boolean),
    veneer: `${passed}/${total}`,
    kerf: `${kerfPassed}/${kerfTotal}`,
    probe: { veneer: p, kerf: measure.kerf.probe },
    budgets,
    failures: grades['veneer/t3'].failures,
  }
  log(
    `   veneer ${results.hidden.veneer} (kerf ${results.hidden.kerf}); budgets ${JSON.stringify(budgets)}`,
  )
}

// -- size
const builds = {}
{
  log('== size (production builds, brotli q11)')
  const work = mkdtempSync(join(tmpdir(), 'veneer-exit-'))
  for (const fw of ['veneer', 'kerf']) {
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
  const kit = builds.veneer.js - builds.kerf.js
  const jsBudget = APP_BUDGET + KIT_ALLOWANCE
  results.size = {
    ok: builds.veneer.js <= jsBudget && builds.veneer.js + builds.veneer.css <= CEILING,
    veneer: { js: builds.veneer.js, css: builds.veneer.css },
    kerf: { js: builds.kerf.js, css: builds.kerf.css },
    kit,
    budget: { app: APP_BUDGET, kitAllowance: KIT_ALLOWANCE, js: jsBudget, ceiling: CEILING },
    kerfWithinAppBudget: builds.kerf.js <= APP_BUDGET,
  }
  log(
    `   veneer JS ${builds.veneer.js} B (kerf ${builds.kerf.js} + kit ${kit}) ≤ ${jsBudget}; CSS ${builds.veneer.css} B; JS + CSS ${builds.veneer.js + builds.veneer.css} ≤ ${CEILING}`,
  )
  results.size.work = work
}

// -- token contrast
{
  log('== contrast (resolved tokens, spec checker)')
  const checker = join(repo, 'packages', 'veneer-core', 'scripts', 'contrast-check.mjs')
  const css = join(repo, 'packages', 'veneer-core', 'styles', 'veneer.css')
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
    join(repo, 'packages', 'veneer', 'scripts', 'a11y.mjs')
  )
  const gallery = await buildGallery(join(results.size.work, 'gallery'))
  // The audit sets the dials from outside the build, so the shop's audited copy keeps the tiers its size build drops.
  const shop = join(results.size.work, 'veneer')
  writeFileSync(
    join(shop, 'vite.audit.ts'),
    `import kerf from '@kerf/core/vite'\nexport default { plugins: [kerf({ purge: { keep: ${JSON.stringify(DIALS)} } })] }\n`,
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
  `| hidden tests | ${results.hidden.ok ? 'pass' : 'FAIL'} | veneer ${results.hidden.veneer} (kerf ${results.hidden.kerf}); price-push ${results.hidden.probe.veneer['price-push'].domMutations} DOM / ${results.hidden.probe.veneer['price-push'].commits} re-runs, add-one ${results.hidden.probe.veneer['add-one'].domMutations} DOM |`,
  `| size | ${results.size.ok ? 'pass' : 'FAIL'} | JS ${kb(results.size.veneer.js)} br = kerf shop ${kb(results.size.kerf.js)} + kit ${kb(results.size.kit)}; budget ${kb(results.size.budget.app)} + kit allowance ${kb(KIT_ALLOWANCE)}; CSS ${kb(results.size.veneer.css)} |`,
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
