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
const tgz = join(root, 'tgz')
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

mkdirSync(tgz, { recursive: true })
const tarballs = {}
for (const dir of readdirSync(pkgs)) {
  const file = join(pkgs, dir, 'package.json')
  if (!existsSync(file)) continue
  const { name } = JSON.parse(readFileSync(file, 'utf8'))
  tarballs[name] = `file:${join(tgz, sh('npm', ['pack', '--silent', '--pack-destination', tgz], join(pkgs, dir)).trim().split('\n').pop())}`
}

// Three apps: the default, Tailwind, and a re-themed warp app that gets Tailwind later through `weft add`.
const theme = `{ seed: { hue: 220, chroma: 0.12 }, dials: { expression: 'quiet', density: 'compact' }, radius: 'round', fonts: { body: 'Georgia, serif' } }`
const apps = [
  { name: 'default', options: { ui: 'warp', db: 'sqlite', auth: true } },
  { name: 'tailwind', options: { ui: 'tailwind', db: 'sqlite', auth: true }, css: ['.flex{', '.rounded-lg{'] },
  { name: 'themed', options: { ui: 'warp', db: 'none' }, theme, add: 'tailwind', css: ['--warp-radius-control:14px', '.mx-3{'] },
]

let port = 5198
for (const { name, options, theme, add, css } of apps) {
  const app = join(root, name)
  const log = text => console.log(`[packed] ${name}: ${text}`)
  scaffold(app, options)
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const dep in deps) if (tarballs[dep]) deps[dep] = tarballs[dep]
  writeFileSync(join(app, 'package.json'), JSON.stringify({ ...pkg, overrides: tarballs }, null, 2))
  if (theme) {
    const file = join(app, 'weft.config.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('warp()', `warp(${theme})`))
  }

  sh('npm', ['install', '--silent'], app)
  const weft = join(app, 'node_modules/.bin/weft')
  if (add) {
    sh(weft, ['add', add], app)
    // Something only Tailwind can have built, in the app's own markup.
    const home = join(app, 'src/routes/index.tsx')
    writeFileSync(home, readFileSync(home, 'utf8').replace('<Badge', '<Badge class="mx-3"'))
    log(`weft add ${add}: pass`)
  }
  for (const [cmd, ...args] of [...(options.db === 'none' ? [] : [['weft', 'db', 'generate']]), ['tsc', '--noEmit'], ['weft', 'check'], ['weft', 'build']]) {
    sh(join(app, 'node_modules/.bin', cmd), args, app)
    log(`${cmd} ${args.join(' ')}: pass`)
  }
  const built = readdirSync(join(app, '.output/public/assets')).filter(f => f.endsWith('.css')).map(f => readFileSync(join(app, '.output/public/assets', f), 'utf8')).join('')
  for (const text of css ?? []) if (!built.includes(text)) throw new Error(`${name}: the built CSS has no ${text}`)

  // Production takes the host's environment, so the scaffold's .env goes in by hand.
  const envFile = join(app, '.env')
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  port++
  const server = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: app, env: { ...process.env, ...env, PORT: String(port) }, stdio: 'ignore' })
  try {
    let status
    for (let i = 0; i < 80 && !status; i++) {
      status = await fetch(`http://localhost:${port}/`).then(r => r.status, () => undefined)
      if (!status) await new Promise(ok => setTimeout(ok, 250))
    }
    if (status !== 200) throw new Error(`${name}: the built server answered ${status}`)
    log('built server: pass')
  } finally {
    server.kill()
  }
}
console.log('[packed] all pass')
