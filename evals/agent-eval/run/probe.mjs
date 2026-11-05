import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { here, projects, realHome, registryPort, repo, state, tgz } from '../lib/paths.mjs'
import { boxed, env } from '../lib/sandbox.mjs'

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
export async function probe({ withRegistry, stackNames, boxFor, cleanup, say }) {
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
