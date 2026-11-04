#!/usr/bin/env node
// Phase 3b's exit check (PLAN §9, "3b. Channels"; research 32): a chat room built by an agent passes the R-code checks
// and a reconnect/resume test, on Node, Bun and Deno.
//
//   node evals/gates/phase3b-exit.mjs prepare <dir>     scaffold, install, `weft db generate`; prints the agent's brief
//   (a fresh agent works in <dir>, from the brief and what the app ships, and sees no e2e)
//   node evals/gates/phase3b-exit.mjs verify <dir>      weft check, tsc, source rules, then the hidden e2e on all three runtimes
//
// verify writes evals/results/phase3b-exit.md and .json; exit 1 if any part fails. Needs bun and deno on PATH and
// packages/core's native compiler built.
import { repoRoot } from '../../scripts/lib/helpers.mjs'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commands, localPackages } from '../lib/gate.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = repoRoot
const packageUrl = localPackages(repo)
const [step, dirArg] = process.argv.slice(2)
if (!['prepare', 'verify'].includes(step) || !dirArg) {
  console.error('usage: phase3b-exit.mjs prepare|verify <dir>')
  process.exit(1)
}
const dir = resolve(dirArg)
const { run, must } = commands(dir, 1 << 26)

export const BRIEF = `Add chat rooms to this app. The app is a weft app: read AGENTS.md first, then \`npx weft docs start\`. Run
\`npx weft check --json\` after changes. Work only inside this directory; don't read weft's own sources in
node_modules beyond what \`weft docs\` gives you.

What to build:
1. A signed-in user opens /chat/<roomId> (a guest is redirected to /login). The room id is any string up to 64 characters.
2. The page has a list, \`<ul class="messages">\`, oldest first, with one \`<li>\` per message whose text is
   \`<author name>: <message text>\`. An input labelled \`Message\` and a button named \`Send\` post a message. The input
   empties after a successful send. A message is 1 to 500 characters; a longer one is refused by the server.
3. Messages are kept in the database, so a reload shows them, server-rendered, and a new visitor sees the history.
   A message appears live for everyone in the room, with no reload, exactly once.
4. While another person in the room is typing, the page shows \`<p class="typing"><name> is typing</p>\`. Your own typing
   never shows on your own page. It goes away about 3 seconds after the last keystroke, and isn't stored.
5. \`<p role="status">\` shows the connection's status word (\`open\`, \`reconnecting\`, and so on).
6. A connection that drops comes back by itself, and whatever was said meanwhile shows up, in order and with no
   duplicates, without a reload. If the server can't replay it, the page must still end up right.
7. Rooms whose id starts with \`team-\` are only for users whose email ends in \`@team.test\`. Anyone else who opens one
   gets no messages, can't send, and sees a \`<p role="alert">\` saying \`Not allowed\`.

In src/server/chat.ts, with these names:
- the channel is exported as \`room\`, with params \`{ roomId }\`, client messages \`say\` (\`{ text }\`) and \`typing\`
  (\`{}\`), and server messages \`said\` and \`typing\`.
- \`listMessages({ roomId })\` is the query for the history. A user who may not be in a room must not read it either.
- \`postSystem({ roomId, text })\` is a mutation that puts a message from the author \`system\` in a room (any signed-in
  user may call it, for now): it is stored and shows live like the others.

The database is SQLite through Drizzle; add what you need to the schema and generate its migration. When you're done,
\`npx weft check\` should report no errors and \`npx weft build\` should succeed. Don't run a production deploy, and use
only made-up test accounts on localhost.`

if (step === 'prepare') {
  must(
    'node',
    [
      join(repo, 'packages/create/bin/create-weft.mjs'),
      dir,
      '--db',
      'sqlite',
      '--auth',
      '--ui',
      'warp',
      '--name',
      'chat',
    ],
    repo,
  )
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const deps of [pkg.dependencies, pkg.devDependencies])
    for (const name of Object.keys(deps ?? {}))
      if (name === '@weft-js/core' || name.startsWith('@weft-js/')) deps[name] = packageUrl(name)
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  must('npm', ['install', '--no-audit', '--no-fund'])
  must('npx', ['weft', 'db', 'generate'])
  must('npx', ['weft', 'agents-md'])
  console.log(BRIEF)
  process.exit(0)
}

const parts = {}
const check = JSON.parse(run('npx', ['weft', 'check', '--json']).stdout || '{}')
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
      compilerOptions: { preserveSymlinks: true, baseUrl: '.', paths },
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

// R004, R007, T013 by hand too: the point of `channel` is that the app holds no socket of its own.
const sources = readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true })
  .filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
  .map((f) => join(f.parentPath, f.name))
const banned = sources.flatMap((f) =>
  [
    ...readFileSync(f, 'utf8').matchAll(
      /new WebSocket|new EventSource|crossws|defineWebSocketHandler|setInterval\(/g,
    ),
  ].map((m) => `${f.slice(dir.length + 1)}: ${m[0]}`),
)
const chat = readFileSync(join(dir, 'src/server/chat.ts'), 'utf8')
parts.source = {
  ok: !banned.length && /\bauthorize\b/.test(chat) && !/authorize:\s*\(\)\s*=>\s*true/.test(chat),
  banned,
}

const json = join(dir, '.weft-matrix.json')
const matrix = run(
  'node',
  [
    join(repo, 'packages/start/scripts/runtime-matrix.mjs'),
    dir,
    '--e2e',
    join(here, 'gates', 'phase3b-exit.e2e.mjs'),
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
writeFileSync(join(here, 'results/phase3b-exit.json'), JSON.stringify(result, null, 2) + '\n')
const row = (r) => `| ${r.runtime} | ${r.ok ? 'pass' : 'FAIL'} | ${r.checks?.length ?? ''} |`
writeFileSync(
  join(here, 'results/phase3b-exit.md'),
  `# Phase 3b exit check

${result.date}: **${ok ? 'PASS' : 'FAIL'}**. \`create-weft --db sqlite --auth --ui warp\`, extended by a fresh agent with chat
rooms from the brief in \`evals/gates/phase3b-exit.mjs\`, then the hidden e2e (\`evals/gates/phase3b-exit.e2e.mjs\`) per runtime, in
Chrome and over a raw WebSocket.

| Runtime | Result | Checks |
|---|---|---|
${runtimes.map(row).join('\n')}

- \`weft check\`: ${parts.check.ok ? 'no errors' : 'errors'} (${JSON.stringify(parts.check.summary)}).
- \`tsc\` on the app: ${own.length} error(s) in \`src/\`, ${parts.types.packages} in linked packages.
- Tables: ${result.tables.join(', ')}. Migrations: ${migrations.join(', ')}.
`,
)
console.log(
  ok ? 'PASS' : 'FAIL',
  JSON.stringify({
    check: parts.check.ok,
    types: parts.types.ok,
    source: parts.source.ok,
    matrix: parts.matrix.ok,
  }),
)
process.exit(ok ? 0 : 1)
