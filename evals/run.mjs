#!/usr/bin/env node
// weft agent eval runner.
//
//   node run.mjs prepare --name smoke --samples 1 [--suite tasks-v2] [--frameworks react,solid] [--tasks 1-price-tag,...]
//   node run.mjs agent   --name smoke [--model sonnet] [--concurrency 4] [--budget 2]
//   node run.mjs grade   --name smoke
//   node run.mjs all     --name smoke --samples 1 ...
//
// `prepare` creates one isolated workspace per (framework, task, sample) outside the repo, with the full prompt in
// PROMPT.md. `agent` runs headless `claude -p` in each workspace. Any other agent can fill the workspaces instead.
// `grade` runs the hidden tests against src/<Component>.tsx and writes results/<name>/{results.json,summary.md}.
import { execFile } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grade } from './grade.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(
  rest.reduce(
    (acc, a, i, xs) => (a.startsWith('--') ? [...acc, [a.slice(2), xs[i + 1]]] : acc),
    [],
  ),
)
const name = opt.name ?? 'run'
const resultsDir = join(root, 'results', name)
const workRoot = join(tmpdir(), 'weft-evals', name)
const taskDir = (suite, task) => join(root, suite, task)

const HEADERS = {
  react: () => `Implement this in **React 19 + TypeScript** (function components and hooks).`,
  solid: () =>
    `Implement this in **SolidJS 1.9 + TypeScript** (\`solid-js\`, function components and signals).`,
}

function prompt(framework, suite, task) {
  const { component } = JSON.parse(readFileSync(join(taskDir(suite, task), 'task.json'), 'utf8'))
  const spec = readFileSync(join(taskDir(suite, task), 'PROMPT.md'), 'utf8')
  const starter = existsSync(join(taskDir(suite, task), 'starter', `${framework}.tsx`))
  return `${HEADERS[framework](component)}

${starter ? `\`src/${component}.tsx\` already exists. Change it as described below, keeping it one file` : `Write a single file \`src/${component}.tsx\``} with a named export \`${component}\`. Work only inside the current
directory. Dependencies are already installed; don't add any. You may run \`npx tsc --noEmit\` to typecheck. Hidden
tests will render the component in jsdom with Testing Library and user-event, so follow the spec's labels and test ids
exactly. Don't write tests. When finished, reply with one line saying you're done.

---

${spec}`
}

function prepare() {
  const frameworks = (opt.frameworks ?? 'react,solid').split(',')
  const suite = opt.suite ?? 'tasks'
  const tasks = opt.tasks ? opt.tasks.split(',') : readdirSync(join(root, suite)).sort()
  const samples = Number(opt.samples ?? 1)
  const jobs = []
  for (const framework of frameworks)
    for (const task of tasks)
      for (let n = 1; n <= samples; n++) {
        const id = `${framework}__${task}__${n}`
        const dir = join(workRoot, id)
        const fw = join(root, 'frameworks', framework)
        mkdirSync(join(dir, 'src'), { recursive: true })
        for (const f of ['package.json', 'tsconfig.json']) cpSync(join(fw, f), join(dir, f))
        if (!existsSync(join(dir, 'node_modules')))
          symlinkSync(join(fw, 'node_modules'), join(dir, 'node_modules'))
        writeFileSync(join(dir, 'PROMPT.md'), prompt(framework, suite, task))
        const { component } = JSON.parse(
          readFileSync(join(taskDir(suite, task), 'task.json'), 'utf8'),
        )
        const starter = join(taskDir(suite, task), 'starter', `${framework}.tsx`)
        if (existsSync(starter)) cpSync(starter, join(dir, 'src', `${component}.tsx`))
        jobs.push({ id, framework, suite, task, sample: n, component, dir })
      }
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(
    join(resultsDir, 'manifest.json'),
    JSON.stringify({ name, created: new Date().toISOString(), jobs }, null, 2),
  )
  console.log(`prepared ${jobs.length} workspaces in ${workRoot}`)
  return jobs
}

const manifest = () => JSON.parse(readFileSync(join(resultsDir, 'manifest.json'), 'utf8'))

async function pool(items, size, fn) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift())
    }),
  )
}

async function agent() {
  const { jobs } = manifest()
  const model = opt.model ?? 'sonnet'
  // A clean env makes the child CLI use its own login instead of the parent session's.
  const env = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    USER: process.env.USER,
    TERM: 'dumb',
  }
  if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  await pool(
    jobs,
    Number(opt.concurrency ?? 4),
    (job) =>
      new Promise((done) => {
        const metaPath = join(job.dir, 'agent.json')
        if (existsSync(metaPath)) {
          done()
          return
        }
        const args = [
          '-p',
          readFileSync(join(job.dir, 'PROMPT.md'), 'utf8'),
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
          String(opt.budget ?? 2),
        ]
        const started = Date.now()
        execFile(
          'claude',
          args,
          { cwd: job.dir, env, timeout: 15 * 60_000, maxBuffer: 1 << 26 },
          (err, stdout) => {
            let out
            try {
              out = JSON.parse(stdout)
            } catch {
              out = { is_error: true, result: (err?.message ?? stdout).slice(0, 500) }
            }
            const meta = {
              model,
              ms: Date.now() - started,
              cost: out.total_cost_usd,
              turns: out.num_turns,
              error: out.is_error ? out.result : undefined,
            }
            if (!out.is_error) writeFileSync(metaPath, JSON.stringify(meta, null, 2))
            console.log(
              `${out.is_error ? 'ERR ' : 'done'} ${job.id}${out.is_error ? ' ' + out.result : ''}`,
            )
            done()
          },
        )
      }),
  )
}

async function gradeAll() {
  const { jobs } = manifest()
  const results = []
  mkdirSync(join(resultsDir, 'solutions'), { recursive: true })
  await pool(jobs, 3, async (job) => {
    const file = join(job.dir, 'src', `${job.component}.tsx`)
    if (existsSync(file)) cpSync(file, join(resultsDir, 'solutions', `${job.id}.tsx`))
    const meta = existsSync(join(job.dir, 'agent.json'))
      ? JSON.parse(readFileSync(join(job.dir, 'agent.json'), 'utf8'))
      : {}
    const r = await grade(job.framework, job.task, file, job.suite ?? 'tasks')
    results.push({ ...job, dir: undefined, ...r, agent: meta })
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${job.id} ${r.passed}/${r.total}`)
  })
  results.sort((a, b) => a.id.localeCompare(b.id))
  writeFileSync(join(resultsDir, 'results.json'), JSON.stringify(results, null, 2))
  writeFileSync(join(resultsDir, 'summary.md'), summary(results))
  console.log('\n' + summary(results))
}

function summary(results) {
  const frameworks = [...new Set(results.map((r) => r.framework))]
  const tasks = [...new Set(results.map((r) => r.task))].sort((a, b) => (a < b ? -1 : 1))
  const cell = (fw, t) => {
    const rs = results.filter((r) => r.framework === fw && r.task === t)
    const tests = rs.reduce((s, r) => s + r.passed, 0) + '/' + rs.reduce((s, r) => s + r.total, 0)
    return `${rs.filter((r) => r.pass).length}/${rs.length} (${tests} tests)`
  }
  const lines = [
    `# ${name}`,
    '',
    `| task | ${frameworks.join(' | ')} |`,
    `|---|${frameworks.map(() => '---').join('|')}|`,
  ]
  for (const t of tasks) lines.push(`| ${t} | ${frameworks.map((fw) => cell(fw, t)).join(' | ')} |`)
  const tot = (fw) => {
    const rs = results.filter((r) => r.framework === fw)
    return `**${rs.filter((r) => r.pass).length}/${rs.length}**`
  }
  lines.push(`| **pass@1** | ${frameworks.map(tot).join(' | ')} |`, '', '## Failures', '')
  for (const r of results.filter((x) => !x.pass)) {
    lines.push(`- **${r.id}** ${r.passed}/${r.total}${r.error ? ` — ${r.error}` : ''}`)
    for (const t of r.tests.filter((x) => !x.ok))
      lines.push(`  - ${t.name}: \`${(t.message ?? '').slice(0, 160)}\``)
  }
  return lines.join('\n') + '\n'
}

if (cmd === 'prepare') prepare()
else if (cmd === 'agent') await agent()
else if (cmd === 'grade') await gradeAll()
else if (cmd === 'all') {
  prepare()
  await agent()
  await gradeAll()
} else console.log('usage: node run.mjs prepare|agent|grade|all --name <run> [options]')
