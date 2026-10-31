// The packed-install gate: every package as a tarball in a fresh full-stack scaffold, so what's checked is what a
// consumer installs. The other suites link the workspace, where undeclared dependencies and TypeScript loaded by Node
// both work; under node_modules neither does.
//
//   node packages/create-weft/scripts/packed.mjs <empty-dir>
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { scaffold } from '../src/index.mjs'
import { packAll, pin, pkgs } from './tarballs.mjs'
import { jobs, pool } from '../../../scripts/jobs.mjs'

if (!process.argv[2]) throw new Error('usage: packed.mjs <empty-dir>')
const root = resolve(process.argv.slice(2).find(a => !a.startsWith('--')))
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const sh = (cmd, args, cwd) => promisify(execFile)(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })

const tarballs = packAll(join(root, 'tgz'))

// Three apps: the default, Tailwind, and a re-themed warp app that gets Tailwind later through `weft add`.
const theme = `{ seed: { hue: 220, chroma: 0.12 }, dials: { expression: 'quiet', density: 'compact' }, radius: 'round', fonts: { body: 'Georgia, serif' } }`
const apps = [
  { name: 'default', options: { ui: 'warp', db: 'sqlite', auth: true } },
  { name: 'tailwind', options: { ui: 'tailwind', db: 'sqlite', auth: true }, css: ['.flex{', '.rounded-lg{'] },
  { name: 'themed', options: { ui: 'warp', db: 'none' }, theme, add: 'tailwind', css: ['--warp-radius-control:14px', '.mx-3{'] },
]

await pool(apps, jobs(), async ({ name, options, theme, add, css }, i) => {
  const app = join(root, name)
  const log = text => console.log(`[packed] ${name}: ${text}`)
  scaffold(app, options)
  writeFileSync(join(app, 'package.json'), JSON.stringify(pin(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), tarballs), null, 2))
  if (theme) {
    const file = join(app, 'weft.config.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('warp()', `warp(${theme})`))
  }

  await sh('npm', ['install', '--silent'], app)
  const weft = join(app, 'node_modules/.bin/weft')
  if (add) {
    await sh(weft, ['add', add], app)
    // Something only Tailwind can have built, in the app's own markup.
    const home = join(app, 'src/routes/index.tsx')
    writeFileSync(home, readFileSync(home, 'utf8').replace('<Badge', '<Badge class="mx-3"'))
    log(`weft add ${add}: pass`)
  }
  for (const [cmd, ...args] of [...(options.db === 'none' ? [] : [['weft', 'db', 'generate']]), ['tsc', '--noEmit'], ['weft', 'check'], ['weft', 'build']]) {
    await sh(join(app, 'node_modules/.bin', cmd), args, app)
    log(`${cmd} ${args.join(' ')}: pass`)
  }
  const built = readdirSync(join(app, '.output/public/assets')).filter(f => f.endsWith('.css')).map(f => readFileSync(join(app, '.output/public/assets', f), 'utf8')).join('')
  for (const text of css ?? []) if (!built.includes(text)) throw new Error(`${name}: the built CSS has no ${text}`)

  // Production takes the host's environment, so the scaffold's .env goes in by hand.
  const envFile = join(app, '.env')
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  const port = 5199 + i
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
})

// A room on the packs' tarballs: two browsers, over the socket and then peer to peer. TypeScript in node_modules and the
// packs' optional dependencies are what this adds.
const room = join(root, 'room')
const browsers = join(pkgs, 'multiplayer/scripts/e2e-browsers.mjs')
writeFileSync(join(root, 'tgz/tarballs.json'), JSON.stringify(tarballs))
sh('node', [browsers, 'prepare', room, '--tarballs', join(root, 'tgz')], root)
sh('node', [browsers, 'run', room, '--runtimes', 'node'], root)
sh('node', [browsers, 'run', room, '--runtimes', 'node', '--via', 'webrtc'], root)
console.log('[packed] room: two browsers: pass')
console.log('[packed] all pass')
