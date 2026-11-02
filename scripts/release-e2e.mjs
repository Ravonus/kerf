#!/usr/bin/env node
// Proves the install: serves a directory of tarballs from a local registry, then from an empty folder runs what a new user
// runs, with no repo in reach. Needs only Node and this script's neighbour registry.mjs, so it can be copied to a machine
// that has neither the repo nor Rust, plus a Chrome or Edge (`CHROME` names one): serving HTML proves nothing about
// hydration, so with no browser the run fails.
//
//   node release-e2e.mjs <dir of .tgz> <empty dir> [--registry-script <path>] [--pm npm|bun|deno] [--no-rust]
//
// --no-rust removes every directory holding cargo or rustc from PATH first, and fails if one is still found.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
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
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') // `Path` on Windows
  env[key] = env[key].split(delimiter).filter(d => !['cargo', 'rustc', 'cargo.exe', 'rustc.exe'].some(b => existsSync(join(d, b)))).join(delimiter)
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
const { findChrome, launch } = await import(pathToFileURL(join(dirname(script), 'cdp.mjs')).href)
const { prepare } = await import(pathToFileURL(join(dirname(script), 'hot-checks.mjs')).href)
const { url, close } = await serveRegistry(tarballs)
env.npm_config_registry = url
env.BUN_CONFIG_REGISTRY = url
env.NPM_CONFIG_REGISTRY = url
writeFileSync(join(empty, '.npmrc'), `registry=${url}\n`)

// Waits for a 200: a dev server can answer something else while it optimizes its dependencies.
const probe = async (port, path = '/', tries = 90) => {
  let last = { status: 0, text: '' }
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${port}${path}`)
      last = { status: r.status, text: await r.text() }
      if (r.status === 200) return last
    } catch {}
    await new Promise(ok => setTimeout(ok, 1000))
  }
  return last
}
const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })
/** A real page: the route with a live query, clicked until its counter moves, with no error and each module loaded once. */
async function hydrates(chrome, port, what) {
  const page = await chrome.page(`http://localhost:${port}/hot`)
  let count, query
  for (let i = 0; i < 120 && !/[1-9]$/.test(count ?? ''); i++) {
    await new Promise(ok => setTimeout(ok, 500))
    try { count = await page.eval(`document.querySelector('#c')?.click(), document.querySelector('#c')?.textContent`); query = await page.eval(`document.querySelector('#q')?.textContent`) } catch {}
  }
  const urls = await page.eval(`performance.getEntriesByType('resource').map(r => r.name)`).catch(() => [])
  const twice = urls.filter(u => /\.[jt]sx?(\?|$)/.test(u)).map(u => u.replace(/\?.*$/, '')).filter((u, i, all) => all.indexOf(u) !== i)
  const problems = [!/[1-9]$/.test(count ?? '') && `the counter never moved (${count})`, query !== 'S1' && `the query shows ${query}`, twice.length && `loaded twice: ${twice[0]}`, page.errors.length && page.errors[0].slice(0, 300)].filter(Boolean)
  step(`${what} hydrates in a browser`, !problems.length, problems.join('; '))
}
function serve(cmd, args, cwd, port) {
  const child = spawn(cmd, args, { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], shell: windows, detached: !windows })
  let log = ''
  child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d))
  return { log: () => log, stop: () => { if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t']); else try { process.kill(-child.pid) } catch {} } }
}

// Deno holds back packages under a day old by default, and this registry gives no dates.
const denoAge = ['--minimum-dependency-age=0']
const runner = { npm: ['npx', []], bun: ['bunx', ['--bun']], deno: ['deno', ['run', '-A', ...denoAge, 'npm:@weft-js/cli']] }[pm]
const weft = (args, cwd) => sh(runner[0], pm === 'deno' ? [...runner[1], ...args] : [...runner[1], 'weft', ...args], cwd)
try {
  const creating = { npm: ['npm', ['create', `@weft-js@${version}`, '--', 'demo', '--yes', '--no-git', '--no-install', '--pm', 'npm']], bun: ['bun', ['x', '--bun', `@weft-js/create@${version}`, 'demo', '--yes', '--no-git', '--no-install', '--pm', 'bun', '--runtime', 'bun']], deno: ['deno', ['run', '-A', ...denoAge, `npm:@weft-js/create@${version}`, 'demo', '--yes', '--no-git', '--no-install', '--pm', 'deno', '--runtime', 'deno']] }[pm]
  await sh(creating[0], creating[1], empty)
  const app = join(empty, 'demo')
  step(`create on ${pm}`, existsSync(join(app, 'package.json')))
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(n => n.startsWith('@weft-js/'))
  step('the scaffold names only published packages', wanted.every(n => readdirSync(tarballs).some(f => f.startsWith(n.replace('@', '').replace('/', '-')))), wanted.join(' '))
  if (pm !== 'deno') writeFileSync(join(app, '.npmrc'), `registry=${url}\n`)
  await sh(pm, pm === 'deno' ? ['install', ...denoAge] : ['install'], app)
  step(`${pm} install`, true)
  await weft(['agents-md'], app)
  const doctor = JSON.parse(await weft(['doctor', '--json'], app))
  step('doctor', doctor.ok !== false, `compiler ${doctor.compiler?.kind ?? JSON.stringify(doctor.compiler)}`)
  if (values['expect-backend']) step(`compiler is ${values['expect-backend']}`, doctor.compiler?.kind === values['expect-backend'])
  const checked = JSON.parse(await weft(['check', '--json'], app))
  step('weft check', checked.ok === true, checked.ok ? '' : JSON.stringify(checked.diagnostics).slice(0, 400))
  prepare(app) // after the check: a route with a counter and a live query, not written to pass one
  await weft(['build'], app)
  step('weft build', existsSync(join(app, '.output')) || existsSync(join(app, 'dist')))

  if (!findChrome()) throw new Error('no Chrome or Edge here: set CHROME')
  const chrome = await launch()
  const port = await freePort()
  const dev = serve(...(pm === 'deno' ? ['deno', ['run', '-A', ...denoAge, 'npm:@weft-js/cli', 'dev', '--port', String(port)]] : pm === 'bun' ? ['bunx', ['--bun', 'weft', 'dev', '--port', String(port)]] : ['npx', ['weft', 'dev', '--port', String(port)]]), app, port)
  const hit = await probe(port)
  await hydrates(chrome, port, 'weft dev')
  dev.stop()
  step('weft dev serves the page', hit.status === 200 && /<html/i.test(hit.text), `HTTP ${hit.status}${hit.status ? '' : ` ${dev.log().slice(-400)}`}`)

  const livePort = await freePort()
  const started = serve(...(pm === 'deno' ? ['deno', ['run', '-A', ...denoAge, 'npm:@weft-js/cli', 'start']] : pm === 'bun' ? ['bunx', ['--bun', 'weft', 'start']] : ['npx', ['weft', 'start']]), app, livePort)
  const live = await probe(livePort)
  await hydrates(chrome, livePort, 'the built app')
  started.stop()
  step('the built app serves the page', live.status === 200 && /<html/i.test(live.text), `HTTP ${live.status}${live.status ? '' : ` ${started.log().slice(-400)}`}`)
  await chrome.close()
} catch (e) {
  step('the run reached its end', false, e.message)
}
close()
console.log(JSON.stringify({ platform: `${process.platform}-${process.arch}`, node: process.version, pm, passed: steps.filter(s => s.ok).length, failed: steps.filter(s => !s.ok).length }))
process.exit(process.exitCode ?? 0)
