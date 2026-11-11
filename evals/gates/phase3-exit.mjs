#!/usr/bin/env node
// Phase 3's exit check (PLAN §9, "3. Start"; research 28 §8): a T3-equivalent todo + auth app, scaffolded and extended
// by an agent, passes one e2e on Node, Bun and Deno.
//
//   node evals/gates/phase3-exit.mjs prepare <dir>     scaffold, install, `kerf db generate`; prints the agent's brief
//   (a fresh agent works in <dir>, from the brief and what the app ships, and sees no e2e)
//   node evals/gates/phase3-exit.mjs verify <dir>      kerf check, tsc, then the hidden e2e on all three runtimes
//
// verify writes evals/results/phase3-exit.md and .json; exit 1 if any part fails. Needs bun and deno on PATH and
// packages/core's native compiler built.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { commands, localPackages, repo } from '../lib/gate.mjs'

const here = join(repo, 'evals')
const packageUrl = localPackages(repo)
const [step, dirArg] = process.argv.slice(2)
if (!['prepare', 'verify'].includes(step) || !dirArg) {
  console.error('usage: phase3-exit.mjs prepare|verify <dir>')
  process.exit(1)
}
const dir = resolve(dirArg)
const { run, must } = commands(dir, 1 << 26)

export const BRIEF = `Add todo sharing to this app. The app is a kerf app: read AGENTS.md first, then \`npx kerf docs start\`. Run
\`npx kerf check --json\` after changes. Work only inside this directory; don't read kerf's own sources in
node_modules beyond what \`kerf docs\` gives you.

What to build:
1. A todo's owner can share it with another user by email. On /todos, each of your own todos has a button named
   \`Share <title>\`. Clicking it shows an input labelled \`Share with\` and a button named \`Confirm share\`.
2. Sharing with an email nobody has shows \`No such user\` in an element with role="alert", and nothing is shared.
3. /todos has a section with a heading \`Shared with me\` holding a list, \`<ul class="shared">\`, of the todos others
   shared with you. Each \`<li>\` has class \`done\` when the todo is done, a \`<label>\` with its title, and a checkbox in
   that label that toggles it. There's no delete button there.
4. The owner can take a share back: while a todo is shared, the owner's row has a button named \`Unshare <title>\`, which
   removes every share of that todo.
5. Keep what exists working: \`ul.todos\` stays the list of your own todos, unchanged in its markup.

Server functions, in src/server/todos.ts, with these names and inputs:
- \`shareTodo({ id, email })\`, \`unshareTodo({ id })\`: only the owner may. Anyone else changes nothing.
- \`toggleTodo({ id })\` keeps its name, and also works for a user the todo is shared with.
- \`listShared()\` is the query behind the section.
A user a todo isn't shared with must not be able to read or change it, whatever id they send. \`deleteTodo\` stays
owner-only. Pages must keep server-rendering with no fetch during hydration, and updates from \`toggleTodo\` should show
in both lists without a reload in the tab that made them.

The database is SQLite through Drizzle; add what you need to the schema and generate its migration. When you're done,
\`npx kerf check\` should report no errors and \`npx kerf build\` should succeed. Don't run a production deploy, and use
only made-up test accounts on localhost.`

if (step === 'prepare') {
  must(
    'node',
    [
      join(repo, 'packages/create-kerf/bin/create-kerf.mjs'),
      dir,
      '--db',
      'sqlite',
      '--auth',
      '--ui',
      'veneer',
      '--name',
      'todos',
    ],
    repo,
  )
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const deps of [pkg.dependencies, pkg.devDependencies])
    for (const name of Object.keys(deps ?? {}))
      if (name === '@kerf/core' || name.startsWith('@kerf/')) deps[name] = packageUrl(name)
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  must('npm', ['install', '--no-audit', '--no-fund'])
  must('npx', ['kerf', 'db', 'generate'])
  must('npx', ['kerf', 'agents-md'])
  console.log(BRIEF)
  process.exit(0)
}

const parts = {}
const check = JSON.parse(run('npx', ['kerf', 'check', '--json']).stdout || '{}')
parts.check = {
  ok: check.ok === true,
  summary: check.summary,
  diagnostics: (check.diagnostics ?? []).map((d) => `${d.code} ${d.file}:${d.line ?? ''}`),
}

// Linked packages keep their own node_modules: types resolve to the app's copy, as they do once published.
const shared = ['drizzle-orm', 'drizzle-zod', 'zod', 'better-auth']
const paths = Object.fromEntries(
  shared.flatMap((p) => [
    [p, [`./node_modules/${p}`]],
    [`${p}/*`, [`./node_modules/${p}/*`]],
  ]),
)
writeFileSync(
  join(dir, 'tsconfig.check.json'),
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: { preserveSymlinks: true, paths },
      include: ['src'],
    },
    null,
    2,
  ),
)
const tsc = run(join(repo, 'packages/core/node_modules/.bin/tsc'), [
  '--noEmit',
  '-p',
  'tsconfig.check.json',
])
const errors = tsc.stdout.split('\n').filter((l) => /error TS/.test(l))
const own = errors.filter((l) => l.startsWith('src/'))
parts.types = { ok: !own.length, app: own, packages: errors.length - own.length }

const json = join(dir, '.kerf-matrix.json')
const matrix = run(
  'node',
  [
    join(repo, 'packages/start/scripts/runtime-matrix.mjs'),
    dir,
    '--e2e',
    join(here, 'gates', 'phase3-exit.e2e.mjs'),
    '--json',
    json,
  ],
  repo,
)
const runtimes = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')).results : []
parts.matrix = { ok: matrix.status === 0, runtimes }
if (matrix.status !== 0) console.error(matrix.stdout.slice(-4000), matrix.stderr.slice(-2000))

const schema = readFileSync(join(dir, 'src/db/schema.ts'), 'utf8')
const migrations = readdirSync(join(dir, 'drizzle')).filter((f) => f.endsWith('.sql'))
const ok = Object.values(parts).every((p) => p.ok)
const result = {
  date: new Date().toISOString().slice(0, 10),
  ok,
  parts,
  migrations,
  tables: [...schema.matchAll(/sqliteTable\('(\w+)'/g)].map((m) => m[1]),
}
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results/phase3-exit.json'), JSON.stringify(result, null, 2) + '\n')
const row = (r) => `| ${r.runtime} | ${r.ok ? 'pass' : 'FAIL'} | ${r.checks?.length ?? ''} |`
writeFileSync(
  join(here, 'results/phase3-exit.md'),
  `# Phase 3 exit check

${result.date}: **${ok ? 'PASS' : 'FAIL'}**. \`create-kerf --db sqlite --auth --ui veneer\`, extended by a fresh agent with todo
sharing from the brief in \`evals/gates/phase3-exit.mjs\`, then the hidden e2e (\`evals/gates/phase3-exit.e2e.mjs\`) per runtime.

| Runtime | Result | Checks |
|---|---|---|
${runtimes.map(row).join('\n')}

- \`kerf check\`: ${parts.check.ok ? 'no errors' : 'errors'} (${JSON.stringify(parts.check.summary)}).
- \`tsc\` on the app: ${own.length} error(s) in \`src/\`, ${parts.types.packages} in linked packages.
- Tables: ${result.tables.join(', ')}. Migrations: ${migrations.join(', ')}.
`,
)
console.log(
  ok ? 'PASS' : 'FAIL',
  JSON.stringify({ check: parts.check.ok, types: parts.types.ok, matrix: parts.matrix.ok }),
)
process.exit(ok ? 0 : 1)
