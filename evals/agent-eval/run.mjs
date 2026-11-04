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
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, request as plainRequest } from 'node:http'
import { request as tlsRequest } from 'node:https'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { startAgent } from './lib/agent.mjs'
import { build, cloneForGrading, hidden, quality, serve } from './lib/grade.mjs'
import {
  claudeBin,
  goldens,
  here,
  projects,
  realHome,
  registryPort,
  repo,
  state,
  tgz,
} from './lib/paths.mjs'
import { boxed, env, newBox } from './lib/sandbox.mjs'
import { activity, checkInit, FORBIDDEN, leaks, usage } from './lib/transcript.mjs'

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
const stackNames = (opt.stacks ?? Object.keys(stacks).join(',')).split(',')
const taskOf = (t) => JSON.parse(readFileSync(join(here, 'tasks', t, 'task.json'), 'utf8'))
const say = (...a) => console.error(...a)
const load = () =>
  execFileSync('/usr/bin/uptime', { encoding: 'utf8' })
    .trim()
    .replace(/.*load averages?: /, '')

/** `tgz` as a registry, everything else proxied from npm: the same one for all stacks, so none installs differently. */
async function withRegistry(fn) {
  const server = spawn(
    process.execPath,
    [join(repo, 'packages/create-weft/scripts/registry.mjs'), tgz, String(registryPort)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  await new Promise((ok) => server.stdout.once('data', ok))
  try {
    return await fn()
  } finally {
    server.kill()
  }
}

function hashTree(dir) {
  const hash = createHash('sha256')
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) hash.update(relative(dir, p)).update(readFileSync(p))
    }
  }
  walk(dir)
  return hash.digest('hex').slice(0, 16)
}

async function golden() {
  await withRegistry(async () => {
    const manifest = {
      madeAt: new Date().toISOString(),
      packages: packagesCommit(),
      claude: execFileSync(claudeBin, ['--version'], { encoding: 'utf8' }).trim(),
      node: process.version,
      stacks: {},
    }
    for (const name of stackNames) {
      const dir = join(goldens, name),
        box = { root: dir, app: join(dir, 'app'), home: join(dir, 'home'), tmp: join(dir, 'tmp') }
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(box.home, { recursive: true })
      mkdirSync(box.tmp)
      const e = { ...env(box), npm_config_cache: join(state, 'npmcache') }
      say(`== ${name}`)
      for (const c of stacks[name].create)
        execFileSync(c[0], c.slice(1), { cwd: dir, env: e, stdio: ['ignore', 'ignore', 'inherit'] })
      for (const c of stacks[name].after)
        execFileSync(c[0], c.slice(1), {
          cwd: box.app,
          env: e,
          stdio: ['ignore', 'ignore', 'inherit'],
        })
      for (const d of [...stacks[name].built, '.git'])
        rmSync(join(box.app, d), { recursive: true, force: true })
      const pkg = JSON.parse(readFileSync(join(box.app, 'package.json'), 'utf8'))
      const installed = (n) => {
        try {
          return JSON.parse(readFileSync(join(box.app, 'node_modules', n, 'package.json'), 'utf8'))
            .version
        } catch {
          return null
        }
      }
      manifest.stacks[name] = {
        tree: hashTree(box.app),
        versions: Object.fromEntries(
          ['react', 'next', 'vite', 'weft', 'tailwindcss']
            .map((n) => [n, installed(n)])
            .filter(([, v]) => v),
        ),
        scripts: pkg.scripts,
        agentFiles: ['AGENTS.md', 'CLAUDE.md', 'README.md'].filter((f) =>
          existsSync(join(box.app, f)),
        ),
      }
    }
    writeFileSync(join(goldens, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify(manifest, null, 2))
  })
}

/** The last commit to touch the packages: goldens built from anything older measure code that's gone. */
const packagesCommit = () =>
  execFileSync('git', ['log', '-1', '--format=%H', '--', 'packages', 'crates'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()

async function pack() {
  rmSync(tgz, { recursive: true, force: true })
  const { packWithAddon } = await import(join(repo, 'packages/create-weft/scripts/pack-all.mjs'))
  const packed = packWithAddon(tgz)
  if (!Object.keys(packed).some((n) => n.startsWith('@weft/compiler-')))
    throw new Error(
      'no native addon packed: run build:native in packages/weft, a real install gets one',
    )
  say(`${Object.keys(packed).length} tarballs from ${packagesCommit().slice(0, 10)}`)
}

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

// ---- probe: every line either must fail in the box or must work in it
const BLOCKED = (box) => ({
  'read user CLAUDE.md': `cat ${realHome}/.claude/CLAUDE.md`,
  'read memory': `ls ${realHome}/.claude/projects`,
  'read ~/.claude.json': `cat ${realHome}/.claude.json`,
  'list home': `ls ${realHome}`,
  'list the repos': `ls ${realHome}/dev`,
  'read this worktree': `cat ${repo}/CLAUDE.md`,
  'read hidden tests': `cat ${here}/tasks/small-todo/hidden.mjs`,
  'read ssh keys': `ls ${realHome}/.ssh`,
  'read user npmrc': `cat ${realHome}/.npmrc`,
  'read other tmp': 'ls /private/tmp/aeval',
  'read tarballs': `ls ${tgz}`,
  'read other runs': `ls ${projects}`,
  'read system temp': 'ls /private/var/folders',
  'write the home': `touch ${realHome}/aeval-escape`,
  'write the repo': `touch ${repo}/aeval-escape`,
  'write tmp outside the box': 'touch /private/tmp/aeval-escape',
  'see other processes': 'ps aux',
  spotlight: 'mdfind CLAUDE.md',
  'ssh out': 'ssh -o BatchMode=yes -o ConnectTimeout=2 yuna-mbp true',
  'local postgres': `node -e "const s=require('net').connect(5432,'localhost');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))"`,
  'home is really fake': `test "$HOME" = "${realHome}"`,
  'host env reached the box':
    'env | grep -E "CLAUDE_CODE_MESSAGING|CLAUDE_CODE_SESSION_ID|CLAUDE_PID" ',
})
const ALLOWED = (box) => ({
  'node 26': 'node -v | grep -q ^v26',
  npm: 'npm -v',
  'write the app': 'touch probe-file && rm probe-file',
  'write tmp': 'touch "$TMPDIR/x"',
  'the registry': `curl -sf http://localhost:${registryPort}/left-pad >/dev/null`,
  'the web': 'curl -sfI https://example.com >/dev/null',
  'a build': 'npm run build >/dev/null 2>&1',
})
async function probe() {
  let bad = 0
  const rows = []
  await withRegistry(async () => {
    for (const name of stackNames) {
      const box = boxFor(name)
      const sh = (line) => {
        const [c, a] = boxed(box, '/bin/zsh', ['-c', line])
        return spawnSync(c, a, { cwd: box.app, env: env(box), encoding: 'utf8', timeout: 180_000 })
      }
      const check = (label, line, wantOk) => {
        const r = sh(line),
          ok = r.status === 0
        const held = ok === wantOk
        if (!held) bad++
        rows.push({ stack: name, label, want: wantOk ? 'works' : 'blocked', held })
        if (!held)
          say(`FAIL ${name}: ${label} (exit ${r.status}) ${(r.stdout + r.stderr).slice(0, 200)}`)
      }
      for (const [label, line] of Object.entries(BLOCKED(box))) check(label, line, false)
      for (const [label, line] of Object.entries(ALLOWED(box))) check(label, line, true)
      cleanup(box)
    }
  })
  // A control: a line that fails only because its target is missing proves nothing. Outside the box these must work.
  const CONTROL = [
    'read user CLAUDE.md',
    'read memory',
    'read ~/.claude.json',
    'list home',
    'list the repos',
    'read this worktree',
    'read hidden tests',
    'read ssh keys',
    'read user npmrc',
    'read other tmp',
    'read tarballs',
    'read other runs',
    'read system temp',
    'see other processes',
  ]
  const lines = BLOCKED({})
  for (const label of CONTROL) {
    const r = spawnSync('/bin/zsh', ['-c', lines[label]], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
      maxBuffer: 1 << 26,
    })
    const held = r.status === 0
    rows.push({ stack: 'control, outside the box', label, want: 'works', held })
    if (!held) {
      bad++
      say(`CONTROL FAIL: ${label} exits ${r.status} outside the box, so its block proves nothing`)
    }
  }
  for (const f of [
    join(realHome, 'aeval-escape'),
    join(repo, 'aeval-escape'),
    '/private/tmp/aeval-escape',
  ])
    if (existsSync(f)) {
      bad++
      say(`ESCAPED: ${f}`)
    }
  say(`probe: ${rows.length - bad}/${rows.length} held across ${stackNames.length} stacks`)
  writeFileSync(join(state, 'probe.json'), JSON.stringify(rows, null, 1))
  process.exit(bad ? 1 : 0)
}

// ---- canary: what actually goes over the wire
/** A pass-through to the API that scans request bodies and keeps nothing else. Never used in a measured run. */
function auditProxy(strings) {
  const seen = { requests: 0, hits: {}, bodyBytes: 0 }
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (d) => chunks.push(d))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      // The signed-in account's own context line, which claude sends for any OAuth login. Declared in research 42. Only this
      // exact sentence is removed: the address anywhere else still counts as a leak.
      const text = body.toString().replace(/The user's email address is [^\s]+@[^\s]+\. /, '')
      seen.requests++
      seen.bodyBytes += body.length
      for (const s of strings) if (text.includes(s)) seen.hits[s] = (seen.hits[s] ?? 0) + 1
      const up = tlsRequest(
        {
          host: 'api.anthropic.com',
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: 'api.anthropic.com' },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers)
          r.pipe(res)
        },
      )
      up.on('error', (e) => res.destroy(e))
      up.end(body)
    })
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() }),
    ),
  )
}

const ASK = `Answer in one short paragraph, from what you were given and without using any tools except where asked. Do you have any CLAUDE.md, user-level instructions, or memory in your context? If so quote the first line of each. Do you know of a machine called yuna-mbp? Then run \`ls -a ~ .\` and \`cat ~/.claude/CLAUDE.md\` with Bash and report what happened.`
async function canary() {
  const planted = 'CANARY-PROJECT-7f3a'
  const out = {}
  const strings = [...FORBIDDEN, planted]
  // yuna-mbp is in ASK itself, so for that string the body scan is only meaningful in the case without the question.
  await withRegistry(async () => {
    const cases = [
      { name: 'box', stack: 'vite-react', prompt: 'Reply with the single word ok.', plant: false },
      { name: 'box-asked', stack: 'vite-react', prompt: ASK, plant: false },
      {
        name: 'control-project-file',
        stack: 'vite-react',
        prompt: 'Reply with the single word ok.',
        plant: true,
      },
    ]
    for (const c of cases) {
      const box = boxFor(c.stack)
      if (c.plant) writeFileSync(join(box.app, 'CLAUDE.md'), `${planted}\n`)
      const proxy = await auditProxy(strings)
      const transcript = join(state, `canary-${c.name}.jsonl`)
      const a = startAgent({
        box,
        model: 'haiku',
        effort: 'low',
        budgetUsd: 0.25,
        wallMs: 180_000,
        transcript,
        extraEnv: { ANTHROPIC_BASE_URL: proxy.url },
      })
      const result = await a.say(c.prompt)
      await a.stop()
      proxy.close()
      out[c.name] = {
        requests: proxy.seen.requests,
        bodyBytes: proxy.seen.bodyBytes,
        hits: proxy.seen.hits,
        init: checkInit(a.events),
        eventLeaks: leaks(
          a.events,
          strings.filter((s) => s !== 'yuna-mbp' && s !== planted),
        ),
        answer: result?.result?.slice(0, 700),
        usage: usage(result),
        error: a.status().stderr.slice(-300),
      }
      cleanup(box)
    }
  })
  // A positive control for the detector: the user's real config, in a plain process with no box. Same scan.
  const proxy = await auditProxy(FORBIDDEN)
  const dir = `${projects}/control`
  mkdirSync(dir, { recursive: true })
  await new Promise((ok) => {
    const p = spawn(
      claudeBin,
      [
        '-p',
        'Reply with the single word ok.',
        '--model',
        'haiku',
        '--effort',
        'low',
        '--no-session-persistence',
        '--output-format',
        'json',
      ],
      {
        cwd: dir,
        env: {
          HOME: realHome,
          USER: process.env.USER,
          PATH: '/usr/bin:/bin',
          ANTHROPIC_BASE_URL: proxy.url,
        },
        stdio: 'ignore',
      },
    )
    p.on('exit', ok)
  })
  proxy.close()
  rmSync(dir, { recursive: true, force: true })
  out['control-real-home'] = { requests: proxy.seen.requests, hits: proxy.seen.hits }
  const verdict = {
    sawRealTraffic: ['box', 'box-asked'].every((n) => out[n].bodyBytes > 10_000), // an empty scan is not a clean one
    bodiesClean:
      !Object.keys(out.box.hits).length &&
      !Object.keys(out['box-asked'].hits).filter((s) => s !== 'yuna-mbp').length,
    detectorSeesProjectFile: !!out['control-project-file'].hits[planted],
    detectorSeesRealConfig: !!out['control-real-home'].hits['yuna-mbp'],
    initClean: ['box', 'box-asked'].every((n) => out[n].init.ok),
    agentSawNoLeak: ['box', 'box-asked'].every((n) => !out[n].eventLeaks.length),
  }
  verdict.pass = Object.values(verdict).every(Boolean)
  console.log(JSON.stringify({ verdict, ...out }, null, 1))
  writeFileSync(join(state, 'canary.json'), JSON.stringify({ verdict, ...out }, null, 1))
  process.exit(verdict.pass ? 0 : 1)
}

// ---- grading
async function gradeOnce(box, stackName, task, n, withQuality) {
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

async function reference() {
  const rows = {}
  for (const name of stackNames) {
    const box = boxFor(name)
    cpSync(join(here, 'tasks', opt.task, 'reference', name), box.app, { recursive: true })
    const g = await gradeOnce(box, name, opt.task, 1, true)
    rows[name] = {
      pass: passedAll(g),
      passed: g.passed,
      total: g.total,
      failed: g.failed,
      flaky: g.flaky,
      quality: g.quality,
    }
    say(
      `${name}: ${g.passed}/${g.total}`,
      g.failed?.length ? JSON.stringify(g.failed).slice(0, 900) : '',
    )
    cleanup(box)
  }
  const dir = join(here, 'tasks', opt.task)
  writeFileSync(
    join(state, `reference-${opt.task}.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hidden: createHash('sha256')
          .update(readFileSync(join(dir, 'hidden.mjs')))
          .digest('hex')
          .slice(0, 16),
        rows,
      },
      null,
      1,
    ),
  )
  console.log(JSON.stringify(rows, null, 1))
  process.exit(Object.values(rows).every((r) => r.pass) ? 0 : 1)
}

/** The hidden tests have to be able to fail: each planted bug, on each stack, must fail the test named for it. */
async function mutants() {
  const list = JSON.parse(readFileSync(join(here, 'tasks', opt.task, 'mutants.json'), 'utf8'))
  const rows = []
  const sourceOf = (name, root) => {
    const out = []
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        e.isDirectory() ? walk(p) : out.push(p)
      }
    }
    walk(root)
    return out
  }
  for (const name of stackNames)
    for (const m of list) {
      const box = boxFor(name)
      const ref = join(here, 'tasks', opt.task, 'reference', name)
      cpSync(ref, box.app, { recursive: true })
      let hit = 0
      for (const f of sourceOf(name, ref)) {
        const file = join(box.app, relative(ref, f))
        let text = readFileSync(file, 'utf8')
        const find = m.alt && text.includes(m.alt) ? m.alt : m.find
        const replace = m.replace.replace('TEXT', find === m.alt ? 'text.value' : 'text')
        if (text.includes(find)) {
          text = text.replaceAll(find, replace)
          writeFileSync(file, text)
          hit++
        }
      }
      if (!hit) throw new Error(`${m.name}: nothing to mutate on ${name}`)
      const g = await gradeOnce(box, name, opt.task, 1, false)
      const caught = g.failed.some((f) => f.title === m.mustFail)
      rows.push({
        stack: name,
        mutant: m.name,
        caught,
        passed: g.passed,
        total: g.total,
        failed: g.failed.map((f) => f.title),
      })
      say(`${name} / ${m.name}: ${caught ? 'caught' : 'MISSED'} (${g.passed}/${g.total})`)
      cleanup(box)
    }
  writeFileSync(join(state, `mutants-${opt.task}.json`), JSON.stringify(rows, null, 1))
  process.exit(rows.every((r) => r.caught) ? 0 : 1)
}

// ---- one measured run
const MAX_CONTINUATIONS = 2
const continuation = (failed) =>
  `These acceptance checks failed:\n${failed.map((f) => `- ${f.title}`).join('\n')}\n\nFix the app.`

export async function runOne({ task, stackName, model, effort, name, force, budgetScale = 1 }) {
  const t = taskOf(task),
    stack = stacks[stackName]
  const m = goldenManifest()
  const box = boxFor(stackName, task)
  const id = box.root.split('/').pop()
  const dir = join(repo, 'evals/results/agent-eval', name),
    raw = join(state, 'transcripts', name)
  mkdirSync(dir, { recursive: true })
  mkdirSync(raw, { recursive: true })
  const prompt = `Use ${stack.framework}.\n\n${readFileSync(join(here, 'tasks', task, 'SPEC.md'), 'utf8')}`
  const startedAt = Date.now(),
    loadBefore = load()
  const wallMs = t.wallMinutes * 60_000
  const a = startAgent({
    box,
    model,
    effort,
    budgetUsd: t.budgetUsd * budgetScale,
    wallMs,
    transcript: join(raw, `${id}.jsonl`),
  })
  const rec = {
    id,
    task,
    stack: stackName,
    model,
    effort,
    startedAt: new Date(startedAt).toISOString(),
    loadBefore,
    claude: m.claude,
    golden: m.stacks[stackName].tree,
    promptSha: createHash('sha256').update(prompt).digest('hex').slice(0, 16),
    web: true,
    rescue: false,
    continuations: 0,
  }
  let last = await a.say(prompt)
  rec.first = { usage: usage(last), wallMs: Date.now() - startedAt, stopped: last?.subtype }
  const infra = (r) =>
    !r ||
    (r.is_error &&
      /api_error|auth/.test(`${r.terminal_reason}`) &&
      r.subtype !== 'error_max_budget_usd')
  if (infra(last)) rec.infra = last?.result ?? a.status().stderr
  let grade = rec.infra ? null : await gradeOnce(box, stackName, task, 0, false)
  if (grade)
    rec.first.hidden = {
      passed: grade.passed,
      total: grade.total,
      failed: grade.failed?.map((f) => f.title),
      flaky: grade.flaky ?? 0,
      buildMs: grade.built.ms,
    }
  rec.first.pass = grade ? passedAll(grade) : false
  while (
    grade &&
    rec.continuations < MAX_CONTINUATIONS &&
    (!passedAll(grade) || (force && rec.continuations === 0)) &&
    !a.status().exited &&
    last?.subtype === 'success'
  ) {
    rec.continuations++
    const failed = passedAll(grade)
      ? [{ title: 'FORCED: harness smoke test, make no change and reply ok' }]
      : grade.failed
    last = await a.say(continuation(failed))
    if (infra(last)) {
      rec.infra = last?.result ?? a.status().stderr
      break
    }
    grade = await gradeOnce(box, stackName, task, rec.continuations, false)
  }
  const finalGrade = rec.infra ? null : await gradeOnce(box, stackName, task, 9, true)
  await a.stop()
  const results = a.events.filter((e) => e.type === 'result')
  const whole = usage(last)
  if (whole) whole.turns = results.reduce((n, r) => n + (r.num_turns ?? 0), 0) // per exchange in the CLI, where tokens and cost are cumulative
  rec.final = {
    usage: whole,
    hidden: finalGrade && {
      passed: finalGrade.passed,
      total: finalGrade.total,
      failed: finalGrade.failed?.map((f) => f.title),
      flaky: finalGrade.flaky ?? 0,
    },
    pass: finalGrade ? passedAll(finalGrade) : false,
    bugsLeft: finalGrade
      ? finalGrade.total === null
        ? null
        : finalGrade.total - finalGrade.passed
      : null,
  }
  rec.quality = finalGrade?.quality
  rec.wallMs = Date.now() - startedAt
  rec.loadAfter = load()
  rec.status = a.status().timedOut ? 'timeout' : (last?.subtype ?? 'died')
  rec.activity = activity(a.events)
  rec.isolation = { init: checkInit(a.events), leaks: leaks(a.events) }
  appendFileSync(join(dir, 'runs.jsonl'), JSON.stringify(rec) + '\n')
  cleanup(box)
  return rec
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
  const problems = []
  for (const task of tasks) {
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
    for (const s of Object.keys(stacks))
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

if (command === 'pack') await pack()
else if (command === 'golden') await golden()
else if (command === 'probe') await probe()
else if (command === 'canary') await canary()
else if (command === 'reference') await reference()
else if (command === 'mutants') await mutants()
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
