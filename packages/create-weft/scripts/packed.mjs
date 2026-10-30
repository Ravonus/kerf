// The packed-install gate: every package as a tarball in a fresh full-stack scaffold, so what's checked is what a
// consumer installs. The other suites link the workspace, where undeclared dependencies and TypeScript loaded by Node
// both work; under node_modules neither does.
//
//   node packages/create-weft/scripts/packed.mjs <empty-dir>
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { scaffold } from '../src/index.mjs'

if (!process.argv[2]) throw new Error('usage: packed.mjs <empty-dir>')
const root = resolve(process.argv[2])
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const pkgs = fileURLToPath(new URL('../../', import.meta.url))
const tgz = join(root, 'tgz'), app = join(root, 'app')
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

mkdirSync(tgz, { recursive: true })
const tarballs = {}
for (const dir of readdirSync(pkgs)) {
  const file = join(pkgs, dir, 'package.json')
  if (!existsSync(file)) continue
  const { name } = JSON.parse(readFileSync(file, 'utf8'))
  tarballs[name] = `file:${join(tgz, sh('npm', ['pack', '--silent', '--pack-destination', tgz], join(pkgs, dir)).trim().split('\n').pop())}`
}

scaffold(app, { ui: 'warp', db: 'sqlite', auth: true })
const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name in deps) if (tarballs[name]) deps[name] = tarballs[name]
writeFileSync(join(app, 'package.json'), JSON.stringify({ ...pkg, overrides: tarballs }, null, 2))

sh('npm', ['install', '--silent'], app)
for (const [cmd, ...args] of [['weft', 'db', 'generate'], ['tsc', '--noEmit'], ['weft', 'check'], ['weft', 'build']]) {
  sh(join(app, 'node_modules/.bin', cmd), args, app)
  console.log(`[packed] ${cmd} ${args.join(' ')}: pass`)
}

// Production takes the host's environment, so the scaffold's .env goes in by hand.
const server = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: app, env: { ...process.env, ...parseEnv(readFileSync(join(app, '.env'), 'utf8')), PORT: '5198' }, stdio: 'inherit' })
try {
  let status
  for (let i = 0; i < 80 && !status; i++) {
    status = await fetch('http://localhost:5198/').then(r => r.status, () => undefined)
    if (!status) await new Promise(ok => setTimeout(ok, 250))
  }
  if (status !== 200) throw new Error(`the built server answered ${status}`)
  console.log('[packed] built server: pass')
} finally {
  server.kill()
}
console.log('[packed] all pass')
