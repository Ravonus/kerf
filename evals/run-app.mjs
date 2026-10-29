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
import { execFile } from 'node:child_process'
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
const app = opt.app ?? 'shop'
const appDir = join(root, 'tasks-v3', app)
const resultsDir = join(root, 'results', name)
const workRoot = join(tmpdir(), 'weft-evals', name)
const task = JSON.parse(readFileSync(join(appDir, 'task.json'), 'utf8'))
const frameworks = () => (opt.frameworks ?? 'react,solid').split(',')
const ws = fw => join(workRoot, fw)
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2)) }

const FRAMEWORK = {
  react: 'React 19 + TypeScript (function components and hooks)',
  solid: 'SolidJS 1.9 + TypeScript (`solid-js`)',
  weft: 'weft (Phase 1 spike) + TypeScript',
}

function prepare() {
  for (const fw of frameworks()) {
    const dir = ws(fw)
    rmSync(dir, { recursive: true, force: true })
    cpSync(join(appDir, 'starter', fw), dir, { recursive: true })
    symlinkSync(join(root, 'frameworks', fw, 'node_modules'), join(dir, 'node_modules'))
  }
  writeJson(join(resultsDir, 'manifest.json'), { name, app, created: new Date().toISOString(), frameworks: frameworks(), workRoot })
  console.log(`prepared ${frameworks().join(', ')} in ${workRoot}`)
}

function prompt() {
  const n = Number(opt.ticket)
  const ticket = readFileSync(join(appDir, 'tickets', `${task.tickets[n - 1]}.md`), 'utf8')
  const intro = n === 1
    ? `You're working on a small shop app written in ${FRAMEWORK[opt.framework]}. The project is in ${ws(opt.framework)} ` +
      `(work only inside that directory and don't read files outside it; dependencies are installed, don't add any). Useful commands there: ` +
      '`npm test` (vitest), `npm run typecheck`, `npm run build`. Hidden acceptance tests will drive the app through ' +
      'its UI with Testing Library, so keep existing labels, roles and test ids working. You may add or change tests. ' +
      'More tickets will follow in this same session. When this ticket is done, reply with one line.'
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
      const files = ['baseline.test.tsx', ...Array.from({ length: n }, (_, i) => `t${i + 1}.test.tsx`)]
      const { tests, error } = await runHidden(fw, join(snap, 'src'), files)
      const byFile = Object.fromEntries(files.map(f => {
        const ts = tests.filter(t => t.file === f)
        return [f.replace('.test.tsx', ''), { passed: ts.filter(t => t.ok).length, total: ts.length }]
      }))
      const visible = await visibleTests(fw, snap)
      grades[`${fw}/t${n}`] = { byFile, failures: tests.filter(t => !t.ok), error, visible }
      console.log(`${fw} t${n}: ${Object.entries(byFile).map(([k, v]) => `${k} ${v.passed}/${v.total}`).join(' · ')} · agent tests ${visible.passed}/${visible.tests}`)
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
    await runHidden(fw, join(snap, 'src'), ['probe.test.tsx'], { PROBE_OUT: probeOut })
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
      effects: (code.match(/\buse(Layout)?Effect\(|\bcreate(Effect|Computed|RenderEffect)\(/g) ?? []).length,
      memos: (code.match(/\buse(Memo|Callback)\(|\bcreateMemo\(/g) ?? []).length,
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
  const L = [`# ${name}`, '', '## Hidden tests per ticket (cumulative)', '', '| | ticket | baseline | t1 | t2 | t3 | agent tests | tokens | tools | min |', '|---|---|---|---|---|---|---|---|---|---|']
  for (const [k, g] of Object.entries(grades)) {
    const [fw, t] = k.split('/')
    const cell = f => (g.byFile[f] ? `${g.byFile[f].passed}/${g.byFile[f].total}` : '')
    const s = stats[k] ?? {}
    L.push(`| ${fw} | ${t} | ${cell('baseline')} | ${cell('t1')} | ${cell('t2')} | ${cell('t3')} | ${g.visible.passed}/${g.visible.tests} | ${s.tokens ?? ''} | ${s.tools ?? ''} | ${s.ms ? (s.ms / 60000).toFixed(1) : ''} |`)
  }
  L.push('', '## Final app', '', '| | bundle gz | src files | lines | effects | memos | add-one | price-push | type-3-chars |', '|---|---|---|---|---|---|---|---|---|')
  const p = x => (x ? `${x.domMutations} DOM · ${x.commits ?? '–'} renders · ${x.wallMs} ms` : '–')
  for (const [fw, v] of Object.entries(m))
    L.push(`| ${fw} | ${typeof v.bundleGzBytes === 'number' ? (v.bundleGzBytes / 1024).toFixed(1) + ' KB' : v.bundleGzBytes} | ${v.srcFiles} | ${v.srcLines} | ${v.effects} | ${v.memos} | ${p(v.probe?.['add-one'])} | ${p(v.probe?.['price-push'])} | ${p(v.probe?.['type-3-chars'])} |`)
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
    cpSync(join(root, 'reference-v3', fw, 'src'), join(dest, 'src'), { recursive: true })
    console.log(`reference ${fw} → t${task.tickets.length}`)
  }
}

const commands = { prepare, prompt, snapshot, stat, grade, measure, summary, reference }
if (!commands[cmd]) console.log(`usage: node run-app.mjs ${Object.keys(commands).join('|')} --name <run> ...`)
else await commands[cmd]()
