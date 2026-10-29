#!/usr/bin/env node
// v3 app-scale eval: one agent session per (framework, model) works through sequential tickets on a multi-file app.
//
//   node run-app.mjs prepare  --name v3-sonnet [--frameworks react,solid] [--app shop]
//   node run-app.mjs prompt   --name v3-sonnet --framework react --ticket 1     # text to send the agent
//   node run-app.mjs snapshot --name v3-sonnet --ticket 1                        # freeze src after a ticket
//   node run-app.mjs stat     --name v3-sonnet --framework react --ticket 1 --tokens N --tools N --ms N
//   node run-app.mjs grade    --name v3-sonnet                                   # every snapshot, cumulative tests
//   node run-app.mjs measure  --name v3-sonnet                                   # perf probe + bundle size, last snapshot
//   node run-app.mjs summary  --name v3-sonnet
//   node run-app.mjs reference --name v3-ref [--frameworks react,solid,weft]    # snapshot reference-v3/<fw> as t3
//   node run-app.mjs bug --suite tasks-v4 --name v4-bug-x --frameworks react --bug no-memo  # reference + buggy-v4 overlay
//   node run-app.mjs prepare --suite tasks-v4 --tickets quiet --name v4q-sonnet ...         # tickets-quiet/: no stated budgets
import { execFile, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'

const root = dirname(fileURLToPath(import.meta.url))
const exec = promisify(execFile)
const [cmd, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.reduce((acc, a, i, xs) => (a.startsWith('--') ? [...acc, [a.slice(2), xs[i + 1]]] : acc), []))
const name = opt.name ?? 'v3'
const suite = opt.suite ?? 'tasks-v3'
const app = opt.app ?? (suite === 'tasks-v3' ? 'shop' : readdirSync(join(root, suite))[0])
const appDir = join(root, suite, app)
const refDir = join(root, suite.replace(/^tasks/, 'reference'))
const resultsDir = join(root, 'results', name)
const workRoot = join(tmpdir(), 'weft-evals', name)
const task = JSON.parse(readFileSync(join(appDir, 'task.json'), 'utf8'))
const frameworks = () => (opt.frameworks ?? 'react,solid').split(',')
const ws = fw => join(workRoot, fw)
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2)) }
// --tickets quiet reads tickets-quiet/ (same app and hidden tests, different ticket text); prepare records it.
const variant = opt.tickets ?? readJson(join(resultsDir, 'manifest.json'), {}).tickets
const ticketsDir = join(appDir, variant ? `tickets-${variant}` : 'tickets')

const FRAMEWORK = {
  react: 'React 19 + TypeScript (function components and hooks)',
  solid: 'SolidJS 1.9 + TypeScript (`solid-js`)',
  weft: 'weft + TypeScript (`weft`)',
}
// Framework-specific setup notes appended to ticket 1's intro; the tickets themselves are identical across frameworks.
const SETUP = {
  weft: ' weft is not React: read AGENTS.md in the project first. `npx weft check --json` reports weft diagnostics ' +
    '(code, location, why, fix); run it after your changes and fix what it reports (the P002 warnings about ' +
    'package.json scripts are expected here, ignore them).',
}

function prepare() {
  for (const fw of frameworks()) {
    const dir = ws(fw)
    rmSync(dir, { recursive: true, force: true })
    cpSync(join(appDir, 'starter', fw), dir, { recursive: true })
    symlinkSync(join(root, 'frameworks', fw, 'node_modules'), join(dir, 'node_modules'))
    // weft's AGENTS.md is generated from the installed weft, so it always matches the compiler the agent runs.
    if (fw === 'weft') execFileSync(join(dir, 'node_modules', '.bin', 'weft'), ['agents-md', '--root', dir], { stdio: 'inherit' })
  }
  writeJson(join(resultsDir, 'manifest.json'), { name, suite, app, tickets: variant, created: new Date().toISOString(), frameworks: frameworks(), workRoot })
  console.log(`prepared ${frameworks().join(', ')} in ${workRoot}`)
}

function prompt() {
  const n = Number(opt.ticket)
  const ticket = readFileSync(join(ticketsDir, `${task.tickets[n - 1]}.md`), 'utf8')
  const intro = n === 1
    ? `You're working on ${task.intro ?? 'a small shop app'} written in ${FRAMEWORK[opt.framework]}. The project is in ${ws(opt.framework)} ` +
      `(work only inside that directory and don't read files outside it; dependencies are installed, don't add any). Useful commands there: ` +
      '`npm test` (vitest), `npm run typecheck`, `npm run build`. Hidden acceptance tests will drive the app through ' +
      'its UI with Testing Library, so keep existing labels, roles and test ids working. You may add or change tests. ' +
      'More tickets will follow in this same session. When this ticket is done, reply with one line.' +
      (SETUP[opt.framework] ?? '')
    : 'Next ticket for the same project. Previous tickets must keep working. When done, reply with one line.'
  console.log(`${intro}\n\n${ticket}`)
}

function snapshot() {
  for (const fw of frameworks()) {
    const dest = join(resultsDir, 'snapshots', fw, `t${opt.ticket}`)
    rmSync(dest, { recursive: true, force: true })
    for (const d of ['src', 'tests']) if (existsSync(join(ws(fw), d))) cpSync(join(ws(fw), d), join(dest, d), { recursive: true })
    console.log(`snapshot ${fw} t${opt.ticket}`)
  }
}

function stat() {
  const p = join(resultsDir, 'agent-stats.json')
  const all = readJson(p, {})
  all[`${opt.framework}/t${opt.ticket}`] = { tokens: Number(opt.tokens), tools: Number(opt.tools), ms: Number(opt.ms) }
  writeJson(p, all)
}

// Copy a snapshot's app source (no agent tests) plus hidden files into the framework's grading dir and run vitest.
async function runHidden(fw, src, files, env = {}) {
  const fwDir = join(root, 'frameworks', fw)
  const id = `app-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const dir = join(fwDir, '.grade', id)
  cpSync(src, join(dir, 'src'), { recursive: true, filter: f => !/\.test\.tsx?$/.test(f) })
  cpSync(join(appDir, 'hidden', 'helpers.ts'), join(dir, 'helpers.ts'))
  // Files the app must not change (e.g. v4's instrumented formatters) are restored from hidden/src.
  if (existsSync(join(appDir, 'hidden', 'src'))) cpSync(join(appDir, 'hidden', 'src'), join(dir, 'src'), { recursive: true })
  for (const f of files) cpSync(join(appDir, 'hidden', f), join(dir, f))
  const report = join(dir, 'report.json')
  try {
    try {
      await exec('npx', ['vitest', 'run', relative(fwDir, dir), '--reporter=json', `--outputFile=${report}`],
        { cwd: fwDir, timeout: 300_000, maxBuffer: 1 << 26, env: { ...process.env, ...env } })
    } catch {}
    if (!existsSync(report)) return { tests: [], error: 'no report' }
    const data = JSON.parse(readFileSync(report, 'utf8'))
    return {
      tests: data.testResults.flatMap(f => {
        const file = f.name.split('/').pop()
        return f.assertionResults.length
          ? f.assertionResults.map(a => ({ file, name: a.title, ok: a.status === 'passed', message: a.failureMessages?.[0]?.split('\n')[0] }))
          : [{ file, name: '(file failed to load)', ok: false, message: f.message?.split('\n')[0] }]
      }),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function visibleTests(fw, snap) {
  // The agent's own tests, run inside a scratch copy of its workspace.
  const dir = join(workRoot, `.visible-${fw}`)
  rmSync(dir, { recursive: true, force: true })
  cpSync(join(appDir, 'starter', fw), dir, { recursive: true, filter: f => !f.includes('/src') && !f.includes('/tests') })
  cpSync(snap, dir, { recursive: true })
  symlinkSync(join(root, 'frameworks', fw, 'node_modules'), join(dir, 'node_modules'))
  const report = join(dir, 'report.json')
  try { await exec('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${report}`], { cwd: dir, timeout: 300_000, maxBuffer: 1 << 26 }) } catch {}
  const data = readJson(report, null)
  rmSync(dir, { recursive: true, force: true })
  if (!data) return { files: 0, tests: 0, passed: 0 }
  return { files: data.testResults.length, tests: data.numTotalTests, passed: data.numPassedTests }
}

async function grade() {
  const grades = {}
  for (const fw of frameworks()) {
    for (let n = 1; n <= task.tickets.length; n++) {
      const snap = join(resultsDir, 'snapshots', fw, `t${n}`)
      if (!existsSync(snap)) continue
      const files = ['baseline.test.tsx', ...Array.from({ length: n }, (_, i) => `t${i + 1}.test.tsx`)].filter(f => existsSync(join(appDir, 'hidden', f)))
      const { tests, error } = await runHidden(fw, join(snap, 'src'), files)
      const byFile = Object.fromEntries(files.map(f => {
        const ts = tests.filter(t => t.file === f)
        return [f.replace('.test.tsx', ''), { passed: ts.filter(t => t.ok).length, total: ts.length }]
      }))
      // v4 names its work-budget tests `budget: …`, so output and budgets can be scored apart.
      const b = tests.filter(t => t.name.startsWith('budget:'))
      const budget = { passed: b.filter(t => t.ok).length, total: b.length }
      const visible = await visibleTests(fw, snap)
      grades[`${fw}/t${n}`] = { byFile, budget, failures: tests.filter(t => !t.ok), error, visible }
      console.log(`${fw} t${n}: ${Object.entries(byFile).map(([k, v]) => `${k} ${v.passed}/${v.total}`).join(' · ')}${b.length ? ` (budgets ${budget.passed}/${budget.total})` : ''} · agent tests ${visible.passed}/${visible.tests}`)
    }
  }
  writeJson(join(resultsDir, 'grades.json'), grades)
}

async function measure() {
  const out = {}
  for (const fw of frameworks()) {
    const last = task.tickets.length
    const snap = join(resultsDir, 'snapshots', fw, `t${last}`)
    if (!existsSync(snap)) continue
    const probeOut = join(resultsDir, `probe-${fw}.json`)
    if (existsSync(join(appDir, 'hidden', 'probe.test.tsx'))) await runHidden(fw, join(snap, 'src'), ['probe.test.tsx'], { PROBE_OUT: probeOut })
    const probe = readJson(probeOut, null)
    // Production bundle size of the agent's final app.
    const dir = join(workRoot, `.build-${fw}`)
    rmSync(dir, { recursive: true, force: true })
    cpSync(join(appDir, 'starter', fw), dir, { recursive: true, filter: f => !f.includes('/src') && !f.includes('/tests') })
    cpSync(join(snap, 'src'), join(dir, 'src'), { recursive: true })
    symlinkSync(join(root, 'frameworks', fw, 'node_modules'), join(dir, 'node_modules'))
    let gz = null
    try {
      await exec('npx', ['vite', 'build', '--logLevel', 'silent'], { cwd: dir, timeout: 300_000 })
      const assets = join(dir, 'dist', 'assets')
      gz = readdirSync(assets).filter(f => f.endsWith('.js')).reduce((s, f) => s + gzipSync(readFileSync(join(assets, f))).length, 0)
    } catch (e) { gz = `build failed: ${String(e.stderr ?? e).slice(0, 200)}` }
    const srcFiles = []
    const walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(join(d, e.name)) : srcFiles.push(join(d, e.name)))
    walk(join(snap, 'src'))
    const appSrc = srcFiles.filter(f => !/\.test\.tsx?$/.test(f))
    const code = appSrc.map(f => readFileSync(f, 'utf8')).join('\n')
    out[fw] = {
      probe,
      bundleGzBytes: gz,
      srcFiles: appSrc.length,
      srcLines: code.split('\n').length,
      effects: (code.match(/\buse(Layout)?Effect\(|\bcreate(Effect|Computed|RenderEffect)\(|\bwatch\(/g) ?? []).length,
      memos: (code.match(/\buse(Memo|Callback)\(|\bcreateMemo\(|\bderived\(/g) ?? []).length,
    }
    rmSync(dir, { recursive: true, force: true })
    console.log(fw, JSON.stringify(out[fw]))
  }
  writeJson(join(resultsDir, 'measure.json'), out)
}

function summary() {
  const grades = readJson(join(resultsDir, 'grades.json'), {})
  const stats = readJson(join(resultsDir, 'agent-stats.json'), {})
  const m = readJson(join(resultsDir, 'measure.json'), {})
  const ts = task.tickets.map((_, i) => `t${i + 1}`)
  const L = [`# ${name}`, '', '## Hidden tests per ticket (cumulative)', '', `| | ticket | baseline | ${ts.join(' | ')} | budgets | agent tests | tokens | tools | min |`, `|---|---|---|${ts.map(() => '---|').join('')}---|---|---|---|---|`]
  for (const [k, g] of Object.entries(grades)) {
    const [fw, t] = k.split('/')
    const cell = f => (g.byFile[f] ? `${g.byFile[f].passed}/${g.byFile[f].total}` : '')
    const s = stats[k] ?? {}
    L.push(`| ${fw} | ${t} | ${cell('baseline')} | ${ts.map(cell).join(' | ')} | ${g.budget?.total ? `${g.budget.passed}/${g.budget.total}` : ''} | ${g.visible.passed}/${g.visible.tests} | ${s.tokens ?? ''} | ${s.tools ?? ''} | ${s.ms ? (s.ms / 60000).toFixed(1) : ''} |`)
  }
  const labels = [...new Set(Object.values(m).flatMap(v => Object.keys(v.probe ?? {})))]
  L.push('', '## Final app', '', `| | bundle gz | src files | lines | effects | memos | ${labels.join(' | ')} |`, `|---|---|---|---|---|---|${labels.map(() => '---|').join('')}`)
  const p = x => (x ? `${x.domMutations} DOM · ${x.formatCalls !== undefined ? `${x.formatCalls} fmt · ` : ''}${x.commits ?? '–'} renders · ${x.wallMs} ms` : '–')
  for (const [fw, v] of Object.entries(m))
    L.push(`| ${fw} | ${typeof v.bundleGzBytes === 'number' ? (v.bundleGzBytes / 1024).toFixed(1) + ' KB' : v.bundleGzBytes} | ${v.srcFiles} | ${v.srcLines} | ${v.effects} | ${v.memos} | ${labels.map(l => p(v.probe?.[l])).join(' | ')} |`)
  L.push('', '## Failures', '')
  for (const [k, g] of Object.entries(grades)) for (const f of g.failures) L.push(`- **${k}** ${f.file} › ${f.name}: \`${(f.message ?? '').slice(0, 160)}\``)
  writeFileSync(join(resultsDir, 'summary.md'), L.join('\n') + '\n')
  console.log(L.join('\n'))
}

// Treat each framework's reference app as its final (t3) snapshot, so grade/measure/summary run on it.
function reference() {
  for (const fw of frameworks()) {
    const dest = join(resultsDir, 'snapshots', fw, `t${task.tickets.length}`)
    rmSync(dest, { recursive: true, force: true })
    cpSync(join(refDir, fw, 'src'), join(dest, 'src'), { recursive: true })
    console.log(`reference ${fw} → t${task.tickets.length}`)
  }
}

// A planted-bug variant: the reference app with buggy-v4/<fw>/<bug>/ overlaid, as the final snapshot.
function bug() {
  const bugDir = join(root, suite.replace(/^tasks/, 'buggy'))
  for (const fw of frameworks()) {
    const dest = join(resultsDir, 'snapshots', fw, `t${task.tickets.length}`)
    rmSync(dest, { recursive: true, force: true })
    cpSync(join(refDir, fw, 'src'), join(dest, 'src'), { recursive: true })
    cpSync(join(bugDir, fw, opt.bug), join(dest, 'src'), { recursive: true, filter: f => !f.endsWith('BUG.md') })
    console.log(`bug ${fw}/${opt.bug} → t${task.tickets.length}`)
  }
}

const commands = { bug, prepare, prompt, snapshot, stat, grade, measure, summary, reference }
if (!commands[cmd]) console.log(`usage: node run-app.mjs ${Object.keys(commands).join('|')} --name <run> ...`)
else await commands[cmd]()
