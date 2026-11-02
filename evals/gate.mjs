#!/usr/bin/env node
// The Phase 1b exit check for the test gate (`weft test --gate`, PLAN §9): it accepts every eval reference test and
// catches planted junk tests. Each scenario is a diff (before → after) the gate judges like an agent's change.
//
//   node gate.mjs [--starter <dir>] [--budget 120] [--json]
//
// Scenarios on the v3 shop in weft (the evals with a weft reference):
//   fresh    the whole app and every hidden test, from nothing
//   tickets  starter → reference with the ticket tests t1–t3 (needs a weft starter: tasks-v3/shop/starter/weft/src,
//            or --starter)
//   junk     the tickets diff (fresh without a starter) plus planted junk tests and a weakened baseline test; every
//            junk test must be caught, and every reference test still accepted
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatGate, gate } from '../packages/cli/src/gate.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const json = process.argv.includes('--json')
const budgetSec = Number(arg('budget', 120))
const fwDir = join(root, 'frameworks', 'weft')
const hidden = join(root, 'tasks-v3', 'shop', 'hidden')
const reference = join(root, 'reference-v3', 'weft', 'src')
const starterDir = arg('starter', join(root, 'tasks-v3', 'shop', 'starter', 'weft', 'src'))
const starter = existsSync(starterDir) ? starterDir : null
const log = (...a) => { if (!json) console.error(...a) }

if (!existsSync(join(fwDir, 'node_modules'))) {
  console.error('evals/frameworks/weft has no node_modules: run `npm ci` there first')
  process.exit(2)
}

const files = dir => {
  const out = {}
  const walk = rel => {
    for (const name of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name
      if (statSync(join(dir, r)).isDirectory()) walk(r)
      else if (!/\.test\.tsx?$/.test(name)) out[r] = readFileSync(join(dir, r), 'utf8')
    }
  }
  walk('')
  return out
}

const read = f => readFileSync(join(hidden, f), 'utf8')
const tickets = ['t1.test.tsx', 't2.test.tsx', 't3.test.tsx']

// Junk an agent might write. Each must be caught, by the code named in `by`.
const junk = {
  file: 'junk.test.tsx',
  text: `import { screen } from '@testing-library/dom'
import { addTimes, rowText, start } from './helpers'

test('junk: tautology', async () => {
  await start()
  expect(true).toBe(true)
})

test('junk: passes on the old code (no fail-before)', async () => {
  const { user } = await start()
  await addTimes(user, 'Apple', 1)
  expect(screen.getByRole('button', { name: 'Cart (1)' })).toBeTruthy()
})

test('junk: implementation detail (DOM structure, not what the user sees)', async () => {
  await start()
  expect(document.querySelector('li:nth-child(3) span:nth-child(3)')?.textContent).toBe('Only 3 left')
})

test('junk: asserts only that something rendered', async () => {
  await start()
  expect(rowText('Yogurt').length).toBeGreaterThan(0)
})
`,
  by: { 'junk: tautology': ['T002', 'T010'], 'junk: passes on the old code (no fail-before)': ['T010'], 'junk: implementation detail (DOM structure, not what the user sees)': ['T005'], 'junk: asserts only that something rendered': ['T010'] },
}
// A weakened existing test: a strict assertion loosened to "truthy".
const weakenedBaseline = read('baseline.test.tsx').replace("expect(lineField('Apple', 'qty')).toBe('2')", "expect(lineField('Apple', 'qty')).toBeTruthy()")

/** Lay out one scenario under frameworks/weft/.gate/<name> (its node_modules resolve from there) and run the gate. */
async function scenario(name, { before, after, tests }) {
  const dir = join(fwDir, '.gate', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const write = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
  write('vitest.config.ts', `import weft from '@weft-js/core/vite'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  plugins: [weft()],
  resolve: { alias: { '#adapter': ${JSON.stringify(join(fwDir, 'adapter.tsx'))} } },
  test: { environment: 'jsdom', globals: true, include: ['*.test.tsx'], testTimeout: 10_000 },
})
`)
  write('package.json', '{ "name": "gate-scenario", "type": "module", "private": true }')
  write('helpers.ts', read('helpers.ts'))
  for (const [rel, text] of Object.entries(after)) write(`src/${rel}`, text)
  for (const t of tests) if (t.after != null) write(t.rel, t.after)
  const changes = [
    ...[...new Set([...Object.keys(before), ...Object.keys(after)])].map(rel => ({ rel: `src/${rel}`, before: before[rel] ?? null, after: after[rel] ?? null })).filter(c => c.before !== c.after),
    ...tests,
  ]
  if (!Object.keys(before).length) changes.push({ rel: 'helpers.ts', before: null, after: read('helpers.ts') })
  log(`\n== ${name}: ${changes.length} changed files`)
  const started = Date.now()
  const r = await gate(dir, { changes, budgetSec, log: line => log(`   ${line}`) })
  log(formatGate(r))
  for (const d of r.diagnostics) log(`   ${d.code} ${d.severity} ${d.file}:${d.span[0]} ${d.why}`)
  rmSync(dir, { recursive: true, force: true })
  return { name, seconds: Math.round((Date.now() - started) / 100) / 10, result: r }
}

const ref = files(reference)
const results = []

results.push(await scenario('fresh', {
  before: {}, after: ref,
  tests: ['baseline.test.tsx', ...tickets].map(f => ({ rel: f, before: null, after: read(f) })),
}))

const base = starter ? files(starter) : {}
if (starter) {
  log(`starter: ${relative(process.cwd(), starter)}`)
  const tick = await scenario('tickets', { before: base, after: ref, tests: [...tickets.map(f => ({ rel: f, before: null, after: read(f) })), { rel: 'baseline.test.tsx', before: read('baseline.test.tsx'), after: read('baseline.test.tsx') }].filter(t => t.before !== t.after) })
  results.push(tick)
}

// The junk scenario keeps baseline.test.tsx as an existing test so weakening it is visible (T020).
const junkTests = [
  ...tickets.map(f => ({ rel: f, before: null, after: read(f) })),
  { rel: junk.file, before: null, after: junk.text },
  { rel: 'baseline.test.tsx', before: read('baseline.test.tsx'), after: weakenedBaseline },
]
const junkRun = await scenario(starter ? 'junk' : 'junk (no starter: before = nothing)', { before: base, after: ref, tests: junkTests })
results.push(junkRun)

// Verdicts: the gate gives each test `accepted` and the error codes inside it.
const verdict = []
for (const { name, result: r } of results.filter(x => !x.name.startsWith('junk'))) {
  const rejected = r.tests.filter(t => !t.accepted)
  verdict.push({ scenario: name, ok: r.ok, accepted: r.tests.length - rejected.length, of: r.tests.length, rejected: rejected.map(t => `${t.file} › ${t.name} (${t.codes.join(' ') || `after: ${t.after}`})`) })
}
const jr = junkRun.result
const caught = Object.entries(junk.by).map(([test, codes]) => {
  const t = jr.tests.find(x => x.name === test)
  return { test, expected: codes, found: t?.codes ?? [], caught: !!t && !t.accepted && codes.some(c => t.codes.includes(c)) }
})
const weak = jr.tests.find(t => t.file === 'baseline.test.tsx')
caught.push({ test: "weakened baseline: toBe('2') → toBeTruthy()", expected: ['T020'], found: weak?.codes ?? [], caught: !!weak?.codes.includes('T020') })
const realInJunk = jr.tests.filter(t => t.file !== junk.file && t.file !== 'baseline.test.tsx')
const realOk = realInJunk.filter(t => t.accepted)

const summary = {
  starter: !!starter,
  accepts: verdict,
  junk: caught,
  referenceTestsInJunkRun: { accepted: realOk.length, of: realInJunk.length },
  mutants: Object.fromEntries(results.map(x => [x.name, x.result.mutants])),
  seconds: Object.fromEntries(results.map(x => [x.name, x.seconds])),
  pass: verdict.every(v => v.ok) && caught.every(c => c.caught) && realOk.length === realInJunk.length,
}
if (json) console.log(JSON.stringify(summary, null, 2))
else {
  console.log('\n# gate exit check')
  for (const v of verdict) console.log(`${v.ok ? 'PASS' : 'FAIL'} ${v.scenario}: ${v.accepted}/${v.of} reference tests accepted${v.rejected.length ? `; rejected: ${v.rejected.join(', ')}` : ''}`)
  for (const c of caught) console.log(`${c.caught ? 'CAUGHT' : 'MISSED'} ${c.test}: ${c.found.join(', ') || 'nothing'}`)
  console.log(`reference tests next to the junk: ${realOk.length}/${realInJunk.length} accepted`)
  console.log(summary.pass ? 'PASS' : 'FAIL')
}
process.exit(summary.pass ? 0 : 1)
