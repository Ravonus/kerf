// The packed-install gate: every package as a tarball in a fresh full-stack scaffold, so what's checked is what a
// consumer installs. The other suites link the workspace, where undeclared dependencies and TypeScript loaded by Node
// both work; under node_modules neither does.
//
//   node packages/create/scripts/packed.mjs <empty-dir> [app[,app…]]
import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify, parseEnv } from 'node:util'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { scaffold } from '../src/index.mjs'
import { fnId } from '../../start/src/vite.mjs'
import { hostPlatform } from '../../core/scripts/platform-package.mjs'
import { hotChecks, prepare } from './hot-checks.mjs'
import { mediaApp, mediaServed } from './packed/media.mjs'
import { payApp, payServed, mockStripe } from './packed/pay.mjs'
import { packWithAddon } from './pack-all.mjs'
import { pin, pkgs, writePackedPolicy } from './tarballs.mjs'
import { writeToolShim } from './tool-shim.mjs'
import * as packed from './packed-paths.mjs'
import { jobs, pool } from '../../../scripts/jobs.mjs'

if (!process.argv[2]) throw new Error('usage: packed.mjs <empty-dir> [app]')
const root = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')))
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
// One build id for every app: the native and WASM builds of one app have to come out byte for byte the same.
process.env.WEFT_BUILD_ID ??= 'packed00'
const run = (cmd, args, cwd, env) =>
  promisify(execFile)(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 1 << 26 })
const shell = (cmd, args, cwd) => run(cmd, args, cwd, process.env)

const tarballs = packWithAddon(join(root, 'tgz'))
const hostAddon = `compiler-${hostPlatform().name}`

/** `weft add rust` on a packed install: the crate comes with @weft-js/start, and `weft check` passes without an edit. */
async function rustApp(app, weft, log, sh) {
  await sh(weft, ['add', 'rust', 'hasher'], app)
  const cargo = readFileSync(join(app, 'crates/hasher/Cargo.toml'), 'utf8')
  packed.checkPackedCrate(app, cargo)
  const checked = JSON.parse((await sh(weft, ['check', '--json'], app)).stdout)
  if (!checked.ok) throw new Error(`rust: weft check: ${JSON.stringify(checked.diagnostics)}`)
  log('weft add rust, check: pass')
}

async function rustServed(port, log) {
  const r = await fetch(
    `http://localhost:${port}/_weft/fn/${fnId('digest', 'src/server/hasher.ts')}?i=${encodeURIComponent('{"text":"hello"}')}`,
  )
  const body = await r.json()
  if (r.status !== 200 || body.v?.hash !== '4f9f2cab')
    throw new Error(`rust: the addon answered ${r.status}: ${JSON.stringify(body)}`)
  log('the addon answered: pass')
}

/** PATH for an app with no Rust: only the tools the gate calls, so `cargo` can't be found by anything it runs. */
function withoutRust() {
  const bin = join(root, 'no-rust-bin')
  mkdirSync(bin)
  for (const tool of ['node', 'pnpm', 'ffmpeg', 'ffprobe']) {
    const found = execFileSync('sh', ['-c', `command -v ${tool} || true`], {
      encoding: 'utf8',
    }).trim()
    if (found) writeToolShim(join(bin, tool), found)
  }
  const PATH = [bin, '/usr/bin', '/bin'].join(':')
  for (const tool of ['cargo', 'rustc', 'rustup']) {
    const found = execFileSync('sh', ['-c', `command -v ${tool} || true`], {
      encoding: 'utf8',
      env: { PATH },
    }).trim()
    if (found)
      throw new Error(
        `${found} is on the no-Rust PATH: this gate needs a machine where it's elsewhere`,
      )
  }
  return { ...process.env, PATH }
}
const noRust = withoutRust()

/** `weft dev` on an app, one page served. */
async function devServed(app, weft, port, env, log) {
  prepare(app)
  const server = spawn(weft, ['dev', '--port', String(port)], {
    cwd: app,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (d) => {
      output += d
    })
  try {
    let status
    for (let i = 0; i < 120 && status !== 200; i++) {
      status = await fetch(`http://localhost:${port}/`).then(
        (r) => r.status,
        () => undefined,
      )
      if (status !== 200)
        await new Promise((ok) => {
          setTimeout(ok, 250)
        })
    }
    if (status !== 200) throw new Error(`weft dev answered ${status}`)
    log('weft dev: pass')
    await hotChecks(
      app,
      `http://localhost:${port}`,
      () => output,
      (what) => log(`${what}: pass`),
    )
  } finally {
    server.kill()
    for (const file of [
      'src/components/HotCounter.tsx',
      'src/server/hot.ts',
      'src/routes/hot.css',
      'src/routes/hot.tsx',
      'src/routes/hot2.tsx',
    ])
      rmSync(join(app, file), { force: true })
  }
}

// Eight apps: the default, Tailwind, a re-themed warp app that gets Tailwind later through `weft add`, one that adds media
// and ffmpeg and encodes a GIF, a video ladder and an audio file (ffmpeg has to be installed for that one), one that adds
// Rust (cargo has to be, and it's the only one that sees it), one that adds payments and buys something from a mock of
// Stripe, the default again without the prebuilt addon, whose WASM build has to emit the same client, and the landing template.
const theme = `{ seed: { hue: 220, chroma: 0.12 }, dials: { expression: 'quiet', density: 'compact' }, radius: 'round', fonts: { body: 'Georgia, serif' } }`
const only = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'))[1]
  ?.split(',')
const apps = [
  {
    name: 'default',
    dir: packed.parityDirs.default,
    options: { ui: 'warp', db: 'sqlite', auth: true },
  },
  {
    name: 'tailwind',
    options: { ui: 'tailwind', db: 'sqlite', auth: true },
    css: ['.flex{', '.rounded-lg{'],
  },
  {
    name: 'themed',
    options: { ui: 'warp', db: 'none' },
    theme,
    add: 'tailwind',
    css: ['--warp-radius-control:14px', '.mx-related{'],
  },
  { name: 'media', options: { ui: 'warp', db: 'none' }, media: true },
  { name: 'rust', options: { ui: 'warp', db: 'none' }, rust: true },
  { name: 'pay', options: { ui: 'warp', db: 'sqlite', auth: true }, pay: true },
  {
    name: 'wasm',
    dir: packed.parityDirs.wasm,
    options: { ui: 'warp', db: 'sqlite', auth: true },
    wasm: true,
  }, // the same app name, so the same bytes
  { name: 'landing', options: { template: 'landing' } }, // reads nothing on `/`, so no database is needed to serve it
]
async function verifyBuilt({
  app,
  name,
  css,
  media,
  rust,
  pay,
  wasm,
  i,
  weft,
  log,
  mock,
  sessions,
}) {
  const built = readdirSync(join(app, '.output/public/assets'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(app, '.output/public/assets', f), 'utf8'))
    .join('')
  for (const text of css ?? [])
    if (!built.includes(text)) throw new Error(`${name}: the built CSS has no ${text}`)
  const client = readdirSync(join(app, '.output/public/assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(app, '.output/public/assets', f), 'utf8'))
    .join('')
  if (/STRIPE_|api\.stripe\.com|checkout\/sessions/.test(client))
    throw new Error(`${name}: a rail reached the client`)
  clients[name] = packed.readClientAssets(app)
  if (!pay && /PayError|ENTITLEMENT_REQUIRED/.test(client))
    throw new Error(`${name}: @weft-js/pay is in the bundle of an app that sells nothing`)

  // Production takes the host's environment, so the scaffold's .env goes in by hand.
  const envFile = join(app, '.env')
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  const port = 5199 + i
  if (wasm) await devServed(app, weft, 5399 + i, noRust, log)
  const server = spawn(
    process.execPath,
    [...(pay ? ['--import', './no-network.mjs'] : []), '.output/server/index.mjs'],
    {
      cwd: app,
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
        BETTER_AUTH_URL: `http://localhost:${port}`,
      },
      stdio: 'ignore',
    },
  )
  try {
    let status
    for (let tries = 0; tries < 80 && !status; tries++) {
      status = await fetch(`http://localhost:${port}/`).then(
        (r) => r.status,
        () => undefined,
      )
      if (!status)
        await new Promise((ok) => {
          setTimeout(ok, 250)
        })
    }
    if (status !== 200) throw new Error(`${name}: the built server answered ${status}`)
    log('built server: pass')
    if (media) await mediaServed(app, port, log)
    if (rust) await rustServed(port, log)
    if (pay) await payServed(port, sessions, env.STRIPE_WEBHOOK_SECRET, log)
  } finally {
    server.kill()
    mock?.close()
  }
}

const clients = {}
await pool(
  apps.filter((a) => !only || only.includes(a.name)),
  jobs(),
  async ({ name, dir, options, theme: themed, add, css, media, rust, pay, wasm }, i) => {
    const app = join(root, dir ?? name)
    const log = (text) => console.log(`[packed] ${name}: ${text}`)
    const sh = (cmd, args, cwd) => run(cmd, args, cwd, rust ? process.env : noRust)
    scaffold(app, options)
    const pkg = pin(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), tarballs)
    // pnpm resolves the workspace overrides; npm's pinning path would consume every `add` argument.
    delete pkg.overrides
    writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2))
    if (themed) {
      const file = join(app, 'weft.config.ts')
      writeFileSync(file, readFileSync(file, 'utf8').replace('warp()', `warp(${themed})`))
    }

    writePackedPolicy(app, tarballs)
    await sh('pnpm', ['install', '--no-frozen-lockfile'], app)
    const weft = join(app, 'node_modules/.bin/weft')
    if (wasm) packed.forceWasmCompiler(app, hostAddon)
    const { compiler } = JSON.parse((await sh(weft, ['doctor', '--json'], app)).stdout)
    if (compiler.kind !== (wasm ? 'wasm' : 'native'))
      throw new Error(`${name}: compiling with ${JSON.stringify(compiler)}`)
    log(`compiler ${compiler.kind}: pass`)
    if (add) {
      await sh(weft, ['add', add], app)
      // Something only Tailwind can have built, in the app's own markup.
      const home = join(app, 'src/routes/index.tsx')
      writeFileSync(home, readFileSync(home, 'utf8').replace('<Badge', '<Badge class="mx-related"'))
      log(`weft add ${add}: pass`)
    }
    if (media) await mediaApp(app, weft, log, sh)
    if (rust) await rustApp(app, weft, log, sh)
    const sessions = []
    const mock = pay && (await mockStripe(5299 + i, sessions))
    if (pay) await payApp(app, weft, 5299 + i, log, sh)
    for (const [cmd, ...args] of [
      ...(options.db === 'none' || options.template ? [] : [['weft', 'db', 'generate']]),
      ['tsc', '--noEmit'],
      ['weft', 'check'],
      ['weft', 'build'],
    ]) {
      await sh(join(app, 'node_modules/.bin', cmd), args, app)
      log(`${cmd} ${args.join(' ')}: pass`)
    }
    await verifyBuilt({ app, name, css, media, rust, pay, wasm, i, weft, log, mock, sessions })
  },
)
if (clients.default && clients.wasm) {
  packed.checkClientParity(clients.default, clients.wasm)
  console.log(
    `[packed] native and WASM builds of one app: ${Object.keys(clients.wasm).length} client files identical: pass`,
  )
}

// A room on the packs' tarballs: two browsers, over the socket and then peer to peer. TypeScript in node_modules and the
// packs' optional dependencies are what this adds.
const room = join(root, 'room')
const browsers = join(pkgs, 'multiplayer/test/e2e/e2e-browsers.mjs')
writeFileSync(join(root, 'tgz/tarballs.json'), JSON.stringify(tarballs))
// A person's path through the bin: the install, then the AGENTS.md of the weft that install brought.
const personScope = join(root, 'person-scope')
mkdirSync(personScope)
writePackedPolicy(personScope, tarballs, ['person'])
const person = join(personScope, 'person')
await shell(
  'node',
  [
    join(pkgs, 'create/bin/create-weft.mjs'),
    person,
    '--yes',
    '--pm',
    'pnpm',
    '--install',
    '--no-git',
    '--tarballs',
    join(root, 'tgz'),
  ],
  root,
)
if (!readFileSync(join(person, 'AGENTS.md'), 'utf8').includes('weft check'))
  throw new Error('create-weft left no AGENTS.md')
console.log('[packed] create-weft: AGENTS.md at scaffold: pass')
await shell('node', [browsers, 'prepare', room, '--tarballs', join(root, 'tgz')], root)
await shell('node', [browsers, 'run', room, '--runtimes', 'node'], root)
await shell('node', [browsers, 'run', room, '--runtimes', 'node', '--via', 'webrtc'], root)
console.log('[packed] room: two browsers: pass')
console.log('[packed] all pass')
