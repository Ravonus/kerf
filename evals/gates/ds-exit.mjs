#!/usr/bin/env node
// Phase 4's exit check (PLAN §9, "4. Design"; research 37): @kerf-js/core/ds against raw Tailwind on consistency and a11y, from
// one brief given to a fresh agent, and repeated on every stack in benchmarks/compare (CLAUDE.md).
//
//   node evals/gates/ds-exit.mjs prepare <dir> [--models sonnet,haiku] [--samples 3]    one workspace per stack × model under <dir>
//   node evals/gates/ds-exit.mjs agent <dir> [--concurrency 3] [--budget 4]   run headless `claude -p` in each
//   node evals/gates/ds-exit.mjs verify <dir>   build, audit (compare/design/audit.mjs) and write results/ds-exit.{json,md}
//   node evals/gates/ds-exit.mjs keep <dir>     copy the Sonnet apps to compare/design, which measure.mjs re-audits on every run
//
// The brief names no accessibility or consistency goal, on purpose: prompting for them is known not to help (research
// 03 §1.1), and the claim is that the good result comes by construction. Exit 1 if @kerf-js/core/ds doesn't beat raw Tailwind.
import { execFile, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { audit, chromium } from '../../benchmarks/compare/design/audit.mjs'
import { pool } from '../../scripts/jobs.mjs'
import { repo, writeJson } from '../lib/gate.mjs'
import { STACKS, BRIEF } from './ds-exit/stacks.mjs'

export { STACKS, BRIEF } from './ds-exit/stacks.mjs'

const here = join(repo, 'evals')
const [step, dirArg] = process.argv.slice(2)
const opt = (n) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const page = (entry) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northwind</title></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>\n`

const sessions = (dir) =>
  readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'PROMPT.md')))
    .sort()

function prepare(dir) {
  const models = (opt('models') ?? 'sonnet,haiku').split(',')
  for (const [id, stack] of Object.entries(STACKS)) {
    for (const model of models)
      for (let n = 1; n <= Number(opt('samples') ?? 1); n++) {
        const w = join(dir, `${id}.${model}.${n}`)
        mkdirSync(join(w, 'src'), { recursive: true })
        const out = {
          'package.json': JSON.stringify(
            {
              name: id,
              private: true,
              type: 'module',
              scripts: { build: 'vite build' },
              dependencies: stack.deps,
              devDependencies: stack.dev,
            },
            null,
            2,
          ),
          'index.html': page('/src/main.tsx'),
          'PROMPT.md': BRIEF(stack),
          ...stack.files,
        }
        for (const [f, text] of Object.entries(out)) writeFileSync(join(w, f), text)
        console.error(`install ${id}.${model}.${n}`)
        execFileSync('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], {
          cwd: w,
          stdio: 'ignore',
          env: { ...process.env, npm_config_min_release_age: '0' },
        })
        stack.after?.(w)
      }
  }
}

async function agent(dir) {
  const env = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    USER: process.env.USER,
    TERM: 'dumb',
  }
  if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  await pool(
    sessions(dir),
    Number(opt('concurrency') ?? 3),
    (id) =>
      new Promise((done) => {
        const w = join(dir, id),
          meta = join(w, 'agent.json')
        if (existsSync(meta)) {
          done()
          return
        }
        const model = id.split('.')[1]
        const args = [
          '-p',
          readFileSync(join(w, 'PROMPT.md'), 'utf8'),
          '--model',
          model,
          '--output-format',
          'json',
          '--permission-mode',
          'bypassPermissions',
          '--disallowedTools',
          'WebSearch',
          'WebFetch',
          'Agent',
          '--max-budget-usd',
          opt('budget') ?? '4',
        ]
        const started = Date.now()
        execFile(
          'claude',
          args,
          { cwd: w, env, timeout: 25 * 60_000, maxBuffer: 1 << 26 },
          (err, stdout) => {
            let out
            try {
              out = JSON.parse(stdout)
            } catch {
              out = { is_error: true, result: (err?.message ?? stdout).slice(0, 400) }
            }
            writeFileSync(
              meta,
              JSON.stringify(
                {
                  model,
                  ms: Date.now() - started,
                  cost: out.total_cost_usd,
                  turns: out.num_turns,
                  error: out.is_error ? out.result : undefined,
                },
                null,
                2,
              ),
            )
            console.log(
              `${out.is_error ? 'ERR ' : 'done'} ${id} $${out.total_cost_usd?.toFixed(2)} ${out.num_turns} turns${out.is_error ? ` ${out.result}` : ''}`,
            )
            done()
          },
        )
      }),
  )
}

/** Static a11y and off-system counts from source, the same rules on every stack, and raw values per 100 lines. */
async function source(dir) {
  const { designChecks } = await import(
    pathToFileURL(join(repo, 'packages/cli/src/design-checks.mjs'))
  )
  const files = []
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(d, f.name))
      else if (/\.(tsx|jsx|css|ts)$/.test(f.name))
        files.push({
          rel: join(d, f.name).slice(dir.length + 1),
          text: readFileSync(join(d, f.name), 'utf8'),
        })
    }
  }
  walk(join(dir, 'src'))
  const a11y = designChecks(dir, { files, exclude: ['**'], tokens: false }).length
  const text = files.map((f) => f.text).join('\n')
  const lines = text.split('\n').length
  const raw =
    (text.match(/#[0-9a-fA-F]{3,8}\b/g)?.length ?? 0) +
    (text.match(/[\w:-]+-\[[^\]\s]+\]/g)?.length ?? 0) +
    (text.match(/\b\d+(?:\.\d+)?(?:px|rem)\b/g)?.length ?? 0) +
    (text.match(/\b(?:rgba?|hsla?|oklch)\(/g)?.length ?? 0)
  return { lines, raw, a11yStatic: a11y }
}

/** Reported, not part of the bar: how alike two sessions' role looks are (mean pairwise Jaccard), the drift between runs of research 23 §1.3. Added after the pilot. */
function agreement(runs) {
  const sets = runs.map(
    (r) => new Set(Object.entries(r.audit.looks).flatMap(([k, v]) => v.map((x) => `${k} ${x}`))),
  )
  const pairs = sets.flatMap((a, i) =>
    sets.slice(i + 1).map((b) => {
      const both = [...a].filter((x) => b.has(x)).length
      return both / (a.size + b.size - both)
    }),
  )
  return mean(pairs)
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export async function auditAll(dirs) {
  const browser = await chromium.launch()
  const out = {}
  try {
    await pool(dirs, 2, async ([id, dir]) => {
      execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dir, stdio: 'pipe' })
      out[id] = await audit(browser, join(dir, 'dist'))
    })
  } finally {
    await browser.close()
  }
  return out
}

function table(results) {
  const by = Object.keys(STACKS).map((id) => ({
    id,
    label: STACKS[id].label,
    runs: Object.entries(results)
      .filter(([k, v]) => k.startsWith(`${id}.`) && v.audit)
      .map(([k, v]) => ({ k, ...v })),
  }))
  const row = (s, get, digits = 0) => {
    const v = mean(s.runs.map(get))
    return v === null ? '—' : v.toFixed(digits)
  }
  const lines = [
    '| Stack | Runs | Brief | axe nodes | contrast | serious | focus lost | overflow | dark screens | distinct values | role drift | agreement between sessions | raw values /100 lines | JS + CSS KB br |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ]
  for (const s of by)
    lines.push(
      `| ${s.label} | ${s.runs.length} | ${row(s, (r) => r.audit.briefPassed, 1)}/${s.runs[0]?.audit.briefTotal ?? '—'} | ${row(s, (r) => r.audit.axe)} | ${row(s, (r) => r.audit.contrast)} | ${row(s, (r) => r.audit.serious)} | ${row(s, (r) => r.audit.focusInvisible)} | ${row(s, (r) => r.audit.overflow, 1)} | ${row(s, (r) => r.audit.darkFollows, 1)}/3 | ${row(s, (r) => r.audit.distinctTotal)} | ${row(s, (r) => r.audit.driftTotal)} | ${s.runs.length > 1 ? `${Math.round(agreement(s.runs) * 100)}%` : '—'} | ${row(s, (r) => (r.source.raw / r.source.lines) * 100, 1)} | ${row(s, (r) => (r.audit.bytes.js + r.audit.bytes.css) / 1024, 1)} |`,
    )
  return lines.join('\n')
}

async function verify(dir) {
  const ids = sessions(dir)
  const results = {}
  const built = []
  for (const id of ids) {
    const w = join(dir, id)
    results[id] = {
      agent: existsSync(join(w, 'agent.json'))
        ? JSON.parse(readFileSync(join(w, 'agent.json'), 'utf8'))
        : null,
    }
    try {
      execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: w, stdio: 'pipe' })
      built.push([id, w])
    } catch (e) {
      results[id].build = String(e.stderr ?? e).slice(0, 300)
      console.error(`build failed: ${id}`)
    }
  }
  const audits = await auditAll(built)
  for (const [id, w] of built) {
    results[id].audit = audits[id]
    results[id].source = await source(w)
  }
  const pick = (key) =>
    Object.entries(results)
      .filter(([k, v]) => k.startsWith(`${key}.`) && v.audit)
      .map(([, v]) => v)
  const score = (key) => {
    const rs = pick(key)
    return {
      axe: mean(rs.map((r) => r.audit.axe)),
      distinct: mean(rs.map((r) => r.audit.distinctTotal)),
      drift: mean(rs.map((r) => r.audit.driftTotal)),
      brief: mean(rs.map((r) => r.audit.briefPassed)),
    }
  }
  const ds = score('kerf-ds'),
    tw = score('kerf-tailwind')
  const verdict = {
    a11y: ds.axe < tw.axe,
    consistency: ds.distinct < tw.distinct && ds.drift <= tw.drift,
    brief: ds.brief >= tw.brief,
  }
  const pass = Object.values(verdict).every(Boolean)
  writeFileSync(
    join(here, 'results/ds-exit.json'),
    JSON.stringify(
      { at: new Date().toISOString(), verdict, pass, ds, tailwind: tw, results },
      null,
      1,
    ) + '\n',
  )
  const md = [
    `# Phase 4 exit check: @kerf-js/core/ds vs raw Tailwind`,
    '',
    `Run ${new Date().toISOString().slice(0, 10)}. ${ids.length} fresh-agent sessions, one brief. **${pass ? 'Met' : 'Not met'}.** a11y: ${verdict.a11y ? 'yes' : 'no'} (${ds.axe?.toFixed(1)} vs ${tw.axe?.toFixed(1)} axe nodes), consistency: ${verdict.consistency ? 'yes' : 'no'} (${ds.distinct?.toFixed(0)} vs ${tw.distinct?.toFixed(0)} distinct values, ${ds.drift?.toFixed(0)} vs ${tw.drift?.toFixed(0)} role looks), brief: ${verdict.brief ? 'yes' : 'no'} (${ds.brief?.toFixed(1)} vs ${tw.brief?.toFixed(1)}).`,
    '',
    'Means per stack over its sessions, lower is better except Brief and dark screens. Axe counts every screen in light and dark, at 1280 and 390, plus the invalid form and the open dialog.',
    '',
    table(results),
    '',
  ]
  for (const [id, r] of Object.entries(results))
    if (r.build) md.push(`- ${id}: build failed: ${r.build.split('\n')[0]}`)
  writeFileSync(join(here, 'results/ds-exit.md'), md.join('\n') + '\n')
  console.log(md.join('\n'))
  process.exit(pass ? 0 : 1)
}

function keep(dir) {
  for (const id of Object.keys(STACKS)) {
    const from = join(dir, `${id}.sonnet.1`),
      to = join(repo, 'benchmarks/compare/design', id)
    mkdirSync(to, { recursive: true })
    for (const f of [
      'src',
      'index.html',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'kerf.config.ts',
    ])
      if (existsSync(join(from, f))) cpSync(join(from, f), join(to, f), { recursive: true })
    const p = JSON.parse(readFileSync(join(to, 'package.json'), 'utf8'))
    for (const k of ['dependencies', 'devDependencies'])
      for (const [n, v] of Object.entries(p[k] ?? {}))
        if (v.startsWith('file:')) p[k][n] = `file:../../../../packages/${v.split('/').pop()}`
    writeJson(join(to, 'package.json'), p)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!['prepare', 'agent', 'verify', 'keep'].includes(step) || !dirArg) {
    console.error('usage: ds-exit.mjs prepare|agent|verify|keep <dir>')
    process.exit(1)
  }
  const dir = resolve(dirArg)
  mkdirSync(dir, { recursive: true })
  await { prepare, agent, verify, keep }[step](dir)
}
