#!/usr/bin/env node
// Proves the install: serves a directory of tarballs from a local registry, then from an empty folder runs what a new user
// runs, with no repo in reach. Needs only Node and this script's neighbour registry.mjs, so it can be copied to a machine
// that has neither the repo nor Rust.
//
//   node release-e2e.mjs <dir of .tgz> <empty dir> [--registry-script <path>] [--pm npm|bun|deno] [--no-rust]
//
// --no-rust removes every directory holding cargo or rustc from PATH first, and fails if one is still found.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'registry-script': { type: 'string' }, pm: { type: 'string', default: 'npm' }, 'no-rust': { type: 'boolean' }, 'expect-backend': { type: 'string' } } })
const [tarballs, empty] = positionals.map(p => resolve(p))
const here = dirname(fileURLToPath(import.meta.url))
const script = resolve(values['registry-script'] ?? join(here, '..', 'packages', 'create-weft', 'scripts', 'registry.mjs'))
const windows = process.platform === 'win32'
const pm = values.pm
const version = readdirSync(tarballs).find(f => /core-\d/.test(f)).match(/(\d+\.\d+\.\d+)\.tgz$/)[1]

const env = { ...process.env, NO_COLOR: '1', npm_config_ignore_scripts: 'false', npm_config_min_release_age: '0', npm_config_audit: 'false', npm_config_fund: 'false' }
if (values['no-rust']) {
  env.PATH = env.PATH.split(delimiter).filter(d => !['cargo', 'rustc', 'cargo.exe', 'rustc.exe'].some(b => existsSync(join(d, b)))).join(delimiter)
  env.CARGO_HOME = join(empty, '.none'); env.RUSTUP_HOME = join(empty, '.none')
}
mkdirSync(empty, { recursive: true })
if (readdirSync(empty).length) throw new Error(`${empty} is not empty`)

const steps = []
const step = (name, ok, detail = '') => { steps.push({ name, ok, detail }); console.log(`[e2e] ${ok ? 'pass' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); if (!ok) { process.exitCode = 1 } }
// Asynchronous on purpose: the registry lives in this process, so a synchronous child would wait forever for its answers.
const sh = (cmd, args, cwd) => new Promise((ok, fail) => {
  const child = spawn(cmd, args, { cwd, env, shell: windows, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''
  child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (err += d))
  child.on('error', fail)
  child.on('close', code => code === 0 ? ok(out) : fail(new Error(`${cmd} ${args.join(' ')} exited ${code}:\n${out.slice(-1500)}\n${err.slice(-1500)}`)))
})
if (values['no-rust']) step('no Rust on PATH', spawnSync('cargo', ['--version'], { env, shell: windows }).status !== 0)

const { serveRegistry } = await import(pathToFileURL(script).href)
const { url, close } = await serveRegistry(tarballs)
env.npm_config_registry = url
env.BUN_CONFIG_REGISTRY = url
env.NPM_CONFIG_REGISTRY = url
writeFileSync(join(empty, '.npmrc'), `registry=${url}\n`)

const probe = async (port, path = '/', tries = 90) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${port}${path}`)
      if (r.status < 500) return { status: r.status, text: await r.text() }
    } catch {}
    await new Promise(ok => setTimeout(ok, 1000))
  }
  return { status: 0, text: '' }
}
function serve(cmd, args, cwd, port) {
  const child = spawn(cmd, args, { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], shell: windows, detached: !windows })
  let log = ''
  child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d))
  return { log: () => log, stop: () => { if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t']); else try { process.kill(-child.pid) } catch {} } }
}

const runner = { npm: ['npx', []], bun: ['bunx', ['--bun']], deno: ['deno', ['run', '-A', 'npm:@weft-js/cli']] }[pm]
const weft = (args, cwd) => sh(runner[0], pm === 'deno' ? [...runner[1], ...args] : [...runner[1], 'weft', ...args], cwd)
try {
  const creating = { npm: ['npm', ['create', `@weft-js@${version}`, '--', 'demo', '--yes', '--no-git', '--no-install', '--pm', 'npm']], bun: ['bun', ['x', '--bun', `@weft-js/create@${version}`, 'demo', '--yes', '--no-git', '--no-install', '--pm', 'bun', '--runtime', 'bun']], deno: ['deno', ['run', '-A', `npm:@weft-js/create@${version}`, 'demo', '--yes', '--no-git', '--no-install', '--pm', 'deno', '--runtime', 'deno']] }[pm]
  await sh(creating[0], creating[1], empty)
  const app = join(empty, 'demo')
  step(`create on ${pm}`, existsSync(join(app, 'package.json')))
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(n => n.startsWith('@weft-js/'))
  step('the scaffold names only published packages', wanted.every(n => readdirSync(tarballs).some(f => f.startsWith(n.replace('@', '').replace('/', '-')))), wanted.join(' '))
  if (pm !== 'deno') writeFileSync(join(app, '.npmrc'), `registry=${url}\n`)
  await sh(pm, ['install'], app)
  step(`${pm} install`, true)
  await weft(['agents-md'], app)
  const doctor = JSON.parse(await weft(['doctor', '--json'], app))
  step('doctor', doctor.ok !== false, `compiler ${doctor.compiler?.kind ?? JSON.stringify(doctor.compiler)}`)
  if (values['expect-backend']) step(`compiler is ${values['expect-backend']}`, doctor.compiler?.kind === values['expect-backend'])
  const checked = JSON.parse(await weft(['check', '--json'], app))
  step('weft check', checked.ok === true, checked.ok ? '' : JSON.stringify(checked.diagnostics).slice(0, 400))
  await weft(['build'], app)
  step('weft build', existsSync(join(app, '.output')) || existsSync(join(app, 'dist')))

  const port = 3400 + (process.pid % 400)
  const dev = serve(...(pm === 'deno' ? ['deno', ['run', '-A', 'npm:@weft-js/cli', 'dev', '--port', String(port)]] : pm === 'bun' ? ['bunx', ['--bun', 'weft', 'dev', '--port', String(port)]] : ['npx', ['weft', 'dev', '--port', String(port)]]), app, port)
  const hit = await probe(port)
  dev.stop()
  step('weft dev serves the page', hit.status === 200 && /<html/i.test(hit.text), `HTTP ${hit.status}${hit.status ? '' : ` ${dev.log().slice(-400)}`}`)

  const started = serve(...(pm === 'deno' ? ['deno', ['run', '-A', 'npm:@weft-js/cli', 'start']] : pm === 'bun' ? ['bunx', ['--bun', 'weft', 'start']] : ['npx', ['weft', 'start']]), app, port + 1)
  const live = await probe(port + 1)
  started.stop()
  step('the built app serves the page', live.status === 200 && /<html/i.test(live.text), `HTTP ${live.status}${live.status ? '' : ` ${started.log().slice(-400)}`}`)
} catch (e) {
  step('the run reached its end', false, e.message)
}
close()
console.log(JSON.stringify({ platform: `${process.platform}-${process.arch}`, node: process.version, pm, passed: steps.filter(s => s.ok).length, failed: steps.filter(s => !s.ok).length }))
process.exit(process.exitCode ?? 0)
