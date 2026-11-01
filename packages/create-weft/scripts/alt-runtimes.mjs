// The packed gate for Bun and Deno: on a machine with one of them and no Node, an app is created, checked, built and
// served, and `weft dev` works with its HMR and sockets. Tarballs reach the app through a local registry, as if
// published. The driver itself runs on any of the three, so it can run where Node isn't installed at all:
//
//   node packages/create-weft/scripts/alt-runtimes.mjs <empty-dir> [bun,deno,node] [--tarballs <dir>]
//
// Without `--tarballs` it packs them, which takes Node. A runtime that isn't installed is reported and skipped.
import { execFile, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { hotChecks, prepare } from './hot-checks.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { tarballs: { type: 'string' } } })
if (!positionals[0]) throw new Error('usage: alt-runtimes.mjs <empty-dir> [bun,deno] [--tarballs <dir>]')
const root = resolve(positionals[0])
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
mkdirSync(root, { recursive: true })
const runtimes = (positionals[1] ?? 'bun,deno').split(',')
const windows = process.platform === 'win32'

const tarballs = values.tarballs ? resolve(values.tarballs) : await pack()
async function pack() {
  const { packWithAddon } = await import('./pack-all.mjs')
  const dest = join(root, 'tgz')
  packWithAddon(dest)
  return dest
}

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
// Its own process: the installs below would otherwise wait on it on this thread.
const server = spawn(process.execPath, [...(process.versions.deno ? ['run', '-A'] : []), fileURLToPath(new URL('./registry.mjs', import.meta.url)), tarballs], { stdio: ['ignore', 'pipe', 'inherit'] })
const registry = await new Promise(ok => server.stdout.once('data', d => ok(d.toString().trim())))

const FLOWS = {
  // Not what this gate is for, but the hot reload checks hold for all three.
  node: {
    create: [windows ? 'npx.cmd' : 'npx', '--yes', `create-weft@${version}`, 'demo', '--yes', '--no-git', '--install'],
    install: [],
    weft: ['node', join('node_modules', '@weft', 'cli', 'bin', 'weft.mjs')],
  },
  bun: {
    create: ['bun', 'x', '--bun', `create-weft@${version}`, 'demo', '--yes', '--no-git', '--install'],
    install: [],
    weft: ['bun', '--bun', join('node_modules', '@weft', 'cli', 'bin', 'weft.mjs')],
  },
  deno: {
    create: ['deno', 'run', '-A', `npm:create-weft@${version}`, 'demo', '--yes', '--no-git', '--install'],
    install: [['deno', 'install']], // the app's dependencies, into node_modules
    weft: ['deno', 'run', '-A', 'npm:@weft/cli'],
  },
}

const ROOM = `import { channel } from '@weft/start'
import { z } from 'zod'
export const room = channel({ params: z.object({ id: z.string() }), authorize: () => true,
  client: { say: z.object({ text: z.string() }) }, server: { said: z.object({ text: z.string() }) },
  on: { say: async ({ msg, room }) => { await room.publish('said', msg) } } })
`
const LIVE = `import { room } from '#/server/room'
export default function Live() {
  const chat = room.connect(() => ({ id: 'a' }))
  return <main><h1>first</h1><p>{chat.status.value}</p></main>
}
`

/** This runtime and a shell's tools on PATH, and nothing that would stand in for Node or cargo. */
function scrubbed(runtime, dir) {
  const found = spawnSync(windows ? 'where' : 'sh', windows ? [runtime] : ['-c', `command -v ${runtime}`], { encoding: 'utf8' }).stdout?.split(/\r?\n/)[0]?.trim()
  if (!found) return
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  if (!windows) symlinkSync(found, join(bin, runtime))
  const own = runtime === 'node' ? [dirname(found)] : windows ? [dirname(found)] : [bin]
  const PATH = [...own, ...(windows ? [join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'])].join(delimiter)
  const home = join(dir, 'home')
  mkdirSync(home)
  const env = {
    PATH, HOME: home, USERPROFILE: home, DENO_DIR: join(home, 'deno'), BUN_INSTALL_CACHE_DIR: join(home, 'bun'),
    NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry, npm_config_ignore_scripts: 'false', BUN_CONFIG_REGISTRY: registry, NO_COLOR: '1', CI: '1',
    ...(windows && { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP }),
  }
  for (const tool of runtime === 'node' ? ['cargo'] : ['node', 'cargo']) {
    const there = spawnSync(tool, ['--version'], { env })
    if (!there.error) throw new Error(`${tool} is on the scrubbed PATH: this gate proves nothing here`)
  }
  return env
}

const wait = ms => new Promise(ok => setTimeout(ok, ms))
async function until(what, ms, test) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      last = await test()
      if (last) return last
    } catch (e) {
      last = e.message
    }
    await wait(250)
  }
  throw new Error(`${what}: gave up, last saw ${last}`)
}

function open(url, protocol) {
  return new Promise((ok, no) => {
    const ws = new WebSocket(url, protocol)
    ws.onopen = () => ok(ws)
    ws.onerror = () => no(new Error(`no websocket at ${url}`))
    setTimeout(() => no(new Error(`websocket at ${url} timed out`)), 15000)
  })
}

/** Whether `/_weft/ws` takes the upgrade. By hand, because a WebSocket here can't send the Origin it requires. */
async function socketUpgrades(base, hosts = ['127.0.0.1', '::1']) {
  const { port, host, origin } = new URL(base)
  const key = btoa('weft-gate-16byte')
  const request = `GET /_weft/ws HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`
  const status = address => new Promise((ok, no) => {
    const socket = connect(Number(port), address, () => socket.write(request))
    socket.once('data', d => {
      socket.destroy()
      ok(d.toString().split('\r\n')[0])
    })
    socket.once('error', no)
    setTimeout(() => no(new Error('/_weft/ws never answered')), 15000)
  })
  // `localhost` is one address or the other depending on the machine.
  const answer = await status(hosts[0]).catch(e => {
    if (hosts.length === 1) throw e
    return socketUpgrades(base, hosts.slice(1)).then(() => ' 101')
  })
  if (!answer.includes(' 101')) throw new Error(`/_weft/ws answered ${answer}`)
}

async function run(env, cwd, [cmd, ...args]) {
  try {
    await promisify(execFile)(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 1 << 26, shell: cmd.endsWith('.cmd') })
  } catch (e) {
    throw new Error(`${cmd} ${args.join(' ')}: ${e.message}\n${e.stdout}\n${e.stderr}`.slice(-1500))
  }
}

async function serving(env, cwd, cmd, port, body) {
  const child = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', d => { log += d })
  child.stderr.on('data', d => { log += d })
  try {
    // `localhost` is one address or the other depending on the machine, and a client may try only the wrong one.
    const answers = host => fetch(`http://${host}:${port}/`, { redirect: 'manual' }).then(() => host, () => false)
    const host = await until('a server', 120000, async () => (await answers('localhost')) || answers('[::1]'))
    await body(`http://${host}:${port}`, () => log)
  } catch (e) {
    e.message += `\n${log.slice(-1200)}`
    throw e
  } finally {
    child.kill()
    await wait(300)
    child.kill('SIGKILL')
  }
}

/** The lower of two free ports in a row. */
function freePorts() {
  return new Promise(ok => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address()
      const next = createServer().once('error', () => probe.close(() => ok(freePorts()))).listen(port + 1, () => next.close(() => probe.close(() => ok(port))))
    })
  })
}

async function flow(runtime, port) {
  const dir = join(root, runtime)
  mkdirSync(dir)
  const env = scrubbed(runtime, dir)
  if (!env) return console.log(`[${runtime}] skipped: not installed`)
  const flows = FLOWS[runtime]
  const pass = what => console.log(`[${runtime}] ${what}: pass`)
  const app = join(dir, 'demo')
  await run(env, dir, flows.create)
  for (const step of flows.install) await run(env, app, step)
  pass('created and installed without Node')
  writeFileSync(join(app, 'src/server/room.ts'), ROOM)
  writeFileSync(join(app, 'src/routes/live.tsx'), LIVE)
  const weft = (...args) => run(env, app, [...flows.weft, ...args])
  await weft('doctor')
  await weft('db', 'generate')
  await weft('check')
  pass('doctor, db generate, check')
  await weft('build')
  pass('build')

  const site = `http://localhost:${port}`
  const served = { ...env, BETTER_AUTH_URL: site, BETTER_AUTH_SECRET: 'x'.repeat(40) }
  await serving(served, app, [...flows.weft, 'start'], port, async base => {
    await until('start', 60000, async () => (await fetch(`${base}/live`)).status === 200)
    const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: 'a@example.test', password: 'correct-horse-battery', name: 'A' }),
    })
    if (signUp.status !== 200) throw new Error(`sign-up: ${signUp.status} ${await signUp.text()}`)
    await socketUpgrades(base)
    pass('start: a page, a sign-up and a socket')
  })

  prepare(app) // plain elements, on purpose: they aren't an app `weft check` would pass
  const dev = port + 1
  await serving({ ...served, BETTER_AUTH_URL: `http://localhost:${dev}` }, app, [...flows.weft, 'dev', '--port', String(dev)], dev, async (base, log) => {
    await until('dev', 120000, async () => (await fetch(`${base}/live`)).status === 200)
    pass('dev: SSR')
    const client = await (await fetch(`${base}/@vite/client`)).text()
    const token = client.match(/wsToken = "([^"]+)"/)?.[1]
    const hmr = await open(`${base.replace('http', 'ws')}/?token=${token}`, 'vite-hmr')
    const pushed = []
    hmr.onmessage = e => pushed.push(JSON.parse(e.data).type)
    await until('hmr hello', 10000, () => pushed.includes('connected'))
    await socketUpgrades(base)
    pass('dev: HMR socket and /_weft/ws')
    const route = join(app, 'src/routes/live.tsx')
    writeFileSync(route, LIVE.replace('first', 'second'))
    await until('hmr push', 15000, () => pushed.some(t => t === 'update' || t === 'full-reload'))
    await until('edit in SSR', 15000, async () => (await (await fetch(`${base}/live`)).text()).includes('second'))
    pass('dev: an edit is pushed and served')
    writeFileSync(route, LIVE.replace('<main>', '<main'))
    await until('syntax error shown', 15000, async () => (await fetch(`${base}/live`)).status >= 500)
    writeFileSync(route, LIVE)
    await until('recovery', 15000, async () => (await (await fetch(`${base}/live`)).text()).includes('first'))
    pass('dev: recovers from a syntax error')
    hmr.close()
    await hotChecks(app, base, log, pass)
  })
}

let failed = false
await Promise.all(runtimes.map(async runtime => flow(runtime, await freePorts()).catch(e => {
  failed = true
  console.log(`[${runtime}] FAIL ${e.message}`)
})))
server.kill()
process.exit(failed ? 1 : 0)
