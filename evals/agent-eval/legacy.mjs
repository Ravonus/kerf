#!/usr/bin/env node
// Cold-start agent comparison. Pre-registered in docs/research/42-agent-eval.md; read that before changing anything here.
//   node run.mjs pack                                    weft's tarballs, with this machine's addon, from this checkout
//   node run.mjs golden                                  scaffold each stack once, from the local registry
//   node run.mjs probe                                   no model: prove what the box blocks and allows, on every stack
//   node run.mjs canary                                  smallest model calls: prove nothing of the user's reaches a request
//   node run.mjs reference --task <t> [--stacks a,b]     no model: the reference through the whole grading path
//   node run.mjs mutants --task <t>                      no model: planted bugs must fail the named test on every stack
//   node run.mjs run --task <t> --stack <s> --model <m> [--effort medium] [--name x] [--force-continuation]
//   node run.mjs plan [--seed n]                         print the matrix in its randomised order; runs nothing
//   node run.mjs report --name x                         medians, spread and every failure, per task, stack and model
//   node run.mjs matrix --approved --name x              the full matrix: refuses until every gate in `ready` passes
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { dispatch } from './run/dispatch.mjs'
import { golden, pack } from './run/prepare.mjs'
import { probe } from './run/probe.mjs'
import { canary } from './run/canary.mjs'
import { reference, mutants } from './run/grade-tasks.mjs'
import { build, cloneForGrading, hidden, quality, serve } from './lib/grade.mjs'
import { claudeBin, goldens, here, projects, registryPort, repo, state, tgz } from './lib/paths.mjs'
import { newBox, profile, env } from './lib/sandbox.mjs'

const {
  positionals: [command],
  values: opt,
} = parseArgs({
  allowPositionals: true,
  options: {
    task: { type: 'string' },
    stack: { type: 'string' },
    stacks: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string', default: 'medium' },
    name: { type: 'string', default: 'scratch' },
    seed: { type: 'string', default: '42' },
    approved: { type: 'boolean' },
    'force-continuation': { type: 'boolean' },
  },
})
const stacks = JSON.parse(readFileSync(join(here, 'stacks.json'), 'utf8'))
const stackNames = (opt.stacks ?? 'weft-warp').split(',')
const taskOf = (t) => JSON.parse(readFileSync(join(here, 'tasks', t, 'task.json'), 'utf8'))
const say = (...a) => console.error(...a)
/** `tgz` as a registry, everything else proxied from npm: the same one for all stacks, so none installs differently. */
async function withRegistry(fn) {
  const server = spawn(
    process.execPath,
    [join(repo, 'packages/create/scripts/registry.mjs'), tgz, String(registryPort)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  await new Promise((ok) => {
    server.stdout.once('data', ok)
  })
  try {
    return await fn()
  } finally {
    server.kill()
  }
}

/** The last commit to touch the packages: goldens built from anything older measure code that's gone. */
const packagesCommit = () =>
  execFileSync('git', ['log', '-1', '--format=%H', '--', 'packages', 'crates'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()

const goldenManifest = () => JSON.parse(readFileSync(join(goldens, 'manifest.json'), 'utf8'))

function boxFor(stack, task) {
  const box = newBox()
  execFileSync('/bin/cp', ['-cRP', join(goldens, stack, 'app'), box.app])
  const starter = task && join(here, 'tasks', task, 'starter', stack)
  if (starter && existsSync(starter)) cpSync(starter, box.app, { recursive: true })
  return box
}
const cleanup = (box) => {
  for (const n of readdirSync(projects))
    if (join(projects, n).startsWith(box.root))
      rmSync(join(projects, n), { recursive: true, force: true })
}

// ---- grading
async function gradeOnce(box, stackName, task, n, withQuality) {
  if (!taskOf(task).gradeable) throw new Error(`${task}: grader is incomplete`)
  const stack = stacks[stackName]
  const copy = await cloneForGrading(box, n)
  const built = await build(copy, stack)
  if (!built.ok)
    return {
      built,
      passed: 0,
      total: null,
      failed: [{ title: 'the app builds', failure: built.error }],
    }
  let server
  try {
    server = await serve(copy, stack)
  } catch (e) {
    return {
      built,
      passed: 0,
      total: null,
      failed: [{ title: 'the app starts', failure: e.message }],
    }
  }
  try {
    const out = { built, ...(await hidden(task, server.base)) }
    if (withQuality)
      out.quality = await quality(task, server.base, copy, join(goldens, stackName, 'app'))
    return out
  } finally {
    server.stop()
  }
}
const passedAll = (g) => g.total !== null && g.passed === g.total

// ---- one measured run
export async function runOne({ task, stackName, model, name }) {
  if (model !== 'gpt-6-luna' || stackName !== 'weft-warp')
    throw new Error('S5 supports only gpt-6-luna and weft-warp')
  const binary = process.env.WEFT_CODEX_BIN
  if (!binary?.startsWith('/')) throw new Error('WEFT_CODEX_BIN must be an absolute path')
  const t = taskOf(task)
  const manifest = goldenManifest()
  const box = boxFor(stackName, task)
  const prompt = `Use ${stacks[stackName].framework}.\n\n${readFileSync(join(here, 'tasks', task, 'SPEC.md'), 'utf8')}`
  try {
    const rec = await dispatch({
      backend: {
        command: '/usr/bin/sandbox-exec',
        prefix: ['-p', profile(box), binary],
        cwd: box.app,
        env: env(box),
        prompt,
        timeoutMs: t.wallMinutes * 60_000,
      },
      grade: async () => passedAll(await gradeOnce(box, stackName, task, 0, false)),
    })
    const dir = join(repo, 'evals/results/agent-eval', name)
    mkdirSync(dir, { recursive: true })
    const receipt = {
      task,
      stack: stackName,
      model,
      ...rec,
      node: process.version,
      versions: manifest.stacks[stackName].versions,
      golden: manifest.stacks[stackName].tree,
    }
    appendFileSync(join(dir, 'runs.jsonl'), JSON.stringify(receipt) + '\n')
    return receipt
  } finally {
    cleanup(box)
  }
}

// ---- the plan
function plan() {
  const { cells, reps, tasks, seed } = JSON.parse(readFileSync(join(here, 'matrix.json'), 'utf8'))
  const jobs = []
  for (const task of tasks)
    for (const c of cells) for (let rep = 1; rep <= reps; rep++) jobs.push({ task, ...c, rep })
  // Fisher-Yates on a seeded LCG, so the order is random and also reproducible.
  let x = Number(opt.seed ?? seed)
  const rnd = (n) => {
    x = (x * 48271) % 2147483647
    return x % n
  }
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[jobs[i], jobs[j]] = [jobs[j], jobs[i]]
  }
  return jobs
}

/** Everything that must be true before the owner's usage is spent on the matrix. */
function ready() {
  const { tasks } = JSON.parse(readFileSync(join(here, 'matrix.json'), 'utf8'))
  const problems = ['S5: Codex auth, MCP isolation and source-read evidence are not verified']
  for (const task of tasks) {
    if (!taskOf(task).gradeable) problems.push(`${task}: grader is incomplete`)
    const file = join(state, `reference-${task}.json`),
      dir = join(here, 'tasks', task)
    if (!existsSync(join(dir, 'hidden.mjs'))) {
      problems.push(`${task}: no hidden tests`)
      continue
    }
    if (!existsSync(file)) {
      problems.push(`${task}: reference not run`)
      continue
    }
    const r = JSON.parse(readFileSync(file, 'utf8'))
    if (
      createHash('sha256')
        .update(readFileSync(join(dir, 'hidden.mjs')))
        .digest('hex')
        .slice(0, 16) !== r.hidden
    )
      problems.push(`${task}: hidden tests changed since the reference run`)
    for (const s of stackNames)
      if (!r.rows[s]?.pass) problems.push(`${task}: reference fails on ${s}`)
    const m = join(state, `mutants-${task}.json`)
    if (!existsSync(m) || !JSON.parse(readFileSync(m, 'utf8')).every((x) => x.caught))
      problems.push(`${task}: mutation check missing or failed`)
  }
  for (const [file, what] of [
    ['probe.json', 'probe'],
    ['canary.json', 'canary'],
  ])
    if (!existsSync(join(state, file))) problems.push(`${what} not run`)
  if (
    existsSync(join(state, 'canary.json')) &&
    !JSON.parse(readFileSync(join(state, 'canary.json'), 'utf8')).verdict.pass
  )
    problems.push('canary failed')
  if (
    spawnSync(
      'git',
      ['status', '--porcelain', 'evals/agent-eval', 'docs/research/42-agent-eval.md'],
      { cwd: repo, encoding: 'utf8' },
    ).stdout.trim()
  )
    problems.push('harness or pre-registration has uncommitted changes')
  const m = goldenManifest()
  if (m.packages !== packagesCommit())
    problems.push(
      'goldens predate the current packages: run pack, golden, then probe, canary, reference and mutants again',
    )
  if (execFileSync(claudeBin, ['--version'], { encoding: 'utf8' }).trim() !== m.claude)
    problems.push('claude version differs from the goldens')
  if (!m.stacks['weft-warp'].agentFiles.includes('AGENTS.md'))
    problems.push(
      'weft scaffold has no AGENTS.md: owner decision open, see 42-agent-eval.md "Open before the matrix"',
    )
  return problems
}

// The archived runner uses npm for child installs and Claude for inference. Keep it
// unavailable until the S5 pnpm policy and Codex isolation work is complete.
if (
  ['pack', 'golden', 'probe', 'canary', 'reference', 'mutants', 'run', 'matrix'].includes(command)
)
  throw new Error(
    'S5 runner is not ready: migrate child installs to pnpm and implement Codex isolation',
  )

if (command === 'pack') await pack({ packagesCommit, say })
else if (command === 'golden')
  await golden({ withRegistry, stackNames, stacks, packagesCommit, say })
else if (command === 'probe') await probe({ withRegistry, stackNames, boxFor, cleanup, say })
else if (command === 'canary') await canary({ withRegistry, boxFor, cleanup })
else if (command === 'reference')
  await reference({ stackNames, boxFor, opt, gradeOnce, passedAll, say, cleanup })
else if (command === 'mutants') await mutants({ stackNames, boxFor, opt, gradeOnce, say, cleanup })
else if (command === 'report') {
  const { report } = await import('./lib/report.mjs')
  console.log(report(join(repo, 'evals/results/agent-eval', opt.name)))
} else if (command === 'plan') {
  const jobs = plan()
  console.log(
    JSON.stringify({ runs: jobs.length, first: jobs.slice(0, 12), notReady: ready() }, null, 1),
  )
} else if (command === 'run') {
  if (!opt.task || !opt.stack || !opt.model)
    throw new Error('run needs --task, --stack and --model')
  if (opt.task !== 'smoke' && !opt.approved)
    throw new Error(
      'only the smoke task runs without --approved: real runs wait for the merge and the owner',
    )
  const rec = await withRegistry(() =>
    runOne({
      task: opt.task,
      stackName: opt.stack,
      model: opt.model,
      effort: opt.effort,
      name: opt.name,
      force: opt['force-continuation'],
    }),
  )
  console.log(JSON.stringify(rec, null, 1))
} else if (command === 'matrix') {
  const problems = ready()
  if (!opt.approved || problems.length) {
    console.error(JSON.stringify({ approved: !!opt.approved, problems }, null, 1))
    process.exit(1)
  }
  await withRegistry(async () => {
    for (const j of plan()) {
      say(`${j.task} ${j.stack} ${j.model} #${j.rep}`)
      await runOne({
        task: j.task,
        stackName: j.stack,
        model: j.model,
        effort: j.effort,
        name: opt.name,
        budgetScale: j.budgetScale,
      })
    }
  })
} else
  console.log(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 12)
      .join('\n'),
  )
process.exit(0)
