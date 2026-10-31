// The sidecar supervisor (research 36 §5): what `weft dev`, `weft build`, `weft start` and `weft check` do for the Rust
// behind `remote()`. It runs in the CLI, never in the server bundle: `remote()` is only `fetch`, so a built server runs
// anywhere, and a sidecar deployed on its own is one environment variable away.
//
//   dev     cargo build, then a stable local proxy in front of the current child. A change under the crate, or a contract
//           change from a server module, builds a new binary, starts it, health-checks it and swaps the proxy; the old
//           child drains and goes. A failed build leaves the old child serving and says why.
//   build   cargo build --release, then the binaries run while Nitro prerenders (a card's `load` may read one), then
//           they go to `.output/rust/`, with a manifest of each one's contract hash.
//   start   each binary on a fixed local port, restarted with backoff if it dies. The web server keeps serving; calls in
//           the gap fail as R107.
//   check   cargo check, with errors mapped to the function they belong to (R103).

import { spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, Agent } from 'node:http'
import { randomBytes } from 'node:crypto'
import { basename, join, relative, resolve } from 'node:path'
import { writeContract } from './contract.mjs'
import { isServerModule } from './vite.mjs'

/** The app names a sidecar: a server module imports `remote`. Nothing else here runs for an app that doesn't. */
export function usesRemote(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(f => f.isFile() && /\.[cm]?[jt]sx?$/.test(f.name) && /['"]@weft\/start\/rust['"]/.test(readFileSync(join(f.parentPath, f.name), 'utf8')))
}

/** Same spelling as `urlVariable` in rust.ts, which can't share a module with this one: it ships in the server bundle. */
export const urlVariable = service => `WEFT_RUST_${service.toUpperCase().replaceAll('-', '_')}_URL`

const external = (rust, service) => rust?.services?.[service]?.external === true
export const crateDir = (root, rust, service) => resolve(root, rust?.services?.[service]?.crate ?? `crates/${service}`)

/** The services in a contract that have a crate here. */
const buildable = (contract, rust) => Object.keys(contract.services ?? {}).filter(s => !external(rust, s))

// ---- cargo --------------------------------------------------------------------------------------------------------

function run(cmd, args, { cwd, env, onLine }) {
  return new Promise(ok => {
    let child
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      return ok({ code: 127, stdout: '', stderr: e.message, missing: true })
    }
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => {
      stderr += d
      onLine?.(`${d}`)
    })
    child.on('error', e => ok({ code: 127, stdout, stderr: e.message, missing: e.code === 'ENOENT' }))
    child.on('close', code => ok({ code, stdout, stderr }))
  })
}

const pascal = name => name[0].toUpperCase() + name.slice(1)
const snake = name => name.replace(/[A-Z]/g, (c, i) => `${i ? '_' : ''}${c.toLowerCase()}`)

/**
 * cargo's JSON messages as diagnostics. An error that names a contract function's types or method is R103, with the
 * function's id, so it points at the TS edit that caused it (research 06 §7); any other is R109.
 */
export function readCargo(stdout, { contract, service, root, dir }) {
  const fns = (contract?.functions ?? []).filter(f => f.impl?.service === service)
  const names = fns.map(f => ({ id: f.id, re: new RegExp(`\\b(${pascal(f.name)}\\w*|${snake(f.name)})\\b`) }))
  const diagnostics = []
  let exe, ok = false
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    if (m.reason === 'compiler-artifact' && m.executable && m.target?.kind?.includes('bin')) exe = m.executable
    if (m.reason === 'build-finished') ok = m.success
    if (m.reason !== 'compiler-message' || m.message?.level !== 'error' || !m.message.code) continue
    const text = m.message.rendered ?? m.message.message
    const hit = names.find(n => n.re.test(text))
    const at = m.message.spans?.find(s => s.is_primary) ?? m.message.spans?.[0]
    const file = at && relative(root, resolve(dir, at.file_name)).replaceAll('\\', '/')
    diagnostics.push({
      code: hit ? 'R103' : 'R109', severity: 'error', ...(hit && { function: hit.id }), file: file ?? '.weft/contract.json',
      span: at ? [at.line_start, at.column_start, at.line_end, at.column_end] : [1, 1, 1, 1],
      why: hit ? `\`${hit.id}\`: the Rust no longer matches the contract: ${m.message.message}` : `\`${service}\` doesn't compile: ${m.message.message}`,
      rendered: text,
    })
  }
  return { ok, exe, diagnostics }
}

/** `verb`: `build` or `check`. Failure names what to fix: a build script's panic is already R103 with the fix. */
export async function cargo(verb, { root, dir, service, contract, release, onLine }) {
  const args = [verb, '--message-format=json', ...(release ? ['--release'] : [])]
  const env = { WEFT_CONTRACT: join(root, '.weft', 'contract.json') }
  const r = await run('cargo', args, { cwd: dir, env, onLine })
  if (r.missing) return { ok: false, diagnostics: [{ code: 'R109', severity: 'error', file: 'package.json', span: [1, 1, 1, 1], why: `\`${service}\` needs Rust: \`cargo\` isn't on PATH. Install it from rustup.rs, or set \`external: true\` for a sidecar built elsewhere.` }] }
  const read = readCargo(r.stdout, { contract, service, root, dir })
  if (r.code === 0) return read
  if (!read.diagnostics.length) {
    const panic = /R103: ([^\n]+)/.exec(r.stderr)?.[1]
    read.diagnostics.push({ code: panic ? 'R103' : 'R109', severity: 'error', file: relative(root, dir).replaceAll('\\', '/') + '/Cargo.toml', span: [1, 1, 1, 1], why: panic ?? `cargo ${verb} failed in \`${service}\`:\n${r.stderr.trim().split('\n').slice(-12).join('\n')}` })
  }
  return { ...read, ok: false }
}

// ---- children -----------------------------------------------------------------------------------------------------

/** Start a binary and wait until it listens and its health check names `hash`. Rejects with why, and leaves nothing running. */
function launch({ exe, service, hash, listen, secret, onExit, log }) {
  return new Promise((ok, no) => {
    const child = spawn(exe, [], { env: { ...process.env, WEFT_LISTEN: listen, WEFT_RUST_SECRET: secret }, stdio: ['ignore', 'pipe', 'inherit'] })
    let out = '', ready = false
    const failed = why => {
      clearTimeout(timer)
      child.kill('SIGKILL')
      no(Object.assign(new Error(why), { code: 'R109' }))
    }
    const timer = setTimeout(() => failed(`\`${service}\` didn't listen within 30 s`), 30_000)
    child.on('error', e => failed(`\`${service}\` didn't start: ${e.message}`))
    child.on('exit', (code, signal) => {
      if (!ready) return failed(`\`${service}\` exited before it listened (${signal ?? code})`)
      onExit?.(code, signal)
    })
    child.stdout.on('data', async d => {
      if (ready) return void process.stdout.write(d)
      out += d
      const addr = /weft-listening (\S+)/.exec(out)?.[1]
      if (!addr) return
      ready = true
      clearTimeout(timer)
      const url = `http://${addr}`
      try {
        const health = await (await fetch(`${url}/_weft/health`)).json()
        if (health.contract !== hash) {
          ready = false
          return failed(`R103: \`${service}\` was built from contract ${health.contract}, and this app's is ${hash}: rebuild it`)
        }
        log?.(`[weft] ${service}: listening on ${addr}`)
        ok({ child, url, port: Number(addr.split(':').pop()), inflight: 0 })
      } catch (e) {
        ready = false
        failed(`\`${service}\`'s health check failed: ${e.message}`)
      }
    })
  })
}

/** SIGTERM, which the crate drains on; SIGKILL if that takes too long. */
function stop(p, wait = 5_000) {
  if (!p || p.child.exitCode !== null) return
  p.stopped = true
  p.child.kill('SIGTERM')
  const t = setTimeout(() => p.child.kill('SIGKILL'), wait)
  t.unref()
  p.child.once('exit', () => clearTimeout(t))
}

// ---- dev ----------------------------------------------------------------------------------------------------------

/** The stable address the dev server is given: it outlives every child, so a reload moves no one's URL. */
function proxy(state) {
  const agent = new Agent({ keepAlive: true })
  const server = createServer((req, res) => {
    const to = state.current
    if (!to) {
      if (!state.failure) return void res.destroy() // between crash and restart: `remote()` reports it, R107
      res.writeHead(422, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ ok: false, error: { code: 'Drift', message: state.failure } }))
    }
    to.inflight++
    res.once('close', () => { if (--to.inflight === 0 && to.retired) stop(to) })
    const up = httpRequest(`${to.url}${req.url}`, { method: req.method, headers: req.headers, agent }, answer => {
      res.writeHead(answer.statusCode, answer.headers)
      answer.pipe(res)
    })
    up.on('error', () => res.destroy())
    req.pipe(up)
  })
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ server, agent, port: server.address().port })))
}

/**
 * Build and start every sidecar, and keep them current. Sets `WEFT_RUST_<NAME>_URL` and `WEFT_RUST_SECRET` in this
 * process before the dev server's worker starts, so it inherits them.
 * @returns {Promise<{ attach(server: import('vite').ViteDevServer): void, close(): Promise<void>, ready: Record<string, any> }>}
 */
export async function devSidecars({ root, site, rust, log = console.log }) {
  root = resolve(root)
  const secret = (process.env.WEFT_RUST_SECRET ||= randomBytes(32).toString('hex'))
  const say = d => log(`[weft] ${d.code} ${d.severity}: ${d.why}${d.rendered ? `\n${d.rendered}` : ''}`)
  let vite, closed = false
  const overlay = message => vite?.ws.send({ type: 'error', err: { message, stack: '', plugin: 'weft:sidecar' } })
  const refresh = async () => {
    const held = process.env.WEFT_BUILD
    process.env.WEFT_BUILD = '1' // the same as a build: server modules load, and nothing connects
    try {
      const { contract, diagnostics } = await writeContract({ root, site, rust })
      diagnostics.filter(d => /^R1/.test(d.code)).forEach(say)
      return { contract, blocked: diagnostics.find(d => /^R10[12]$/.test(d.code) && d.severity === 'error') }
    } finally {
      if (held === undefined) delete process.env.WEFT_BUILD
      else process.env.WEFT_BUILD = held
    }
  }

  const first = await refresh()
  let contract = first.contract
  const states = new Map()

  async function rebuild(service) {
    const s = states.get(service)
    if (s.building) return void (s.again = true)
    s.building = true
    try {
      do {
        s.again = false
        await once(service, s)
      } while (s.again && !closed)
    } finally {
      s.building = false
    }
  }

  async function once(service, s) {
    const hash = contract.services?.[service]?.hash
    if (!hash) return
    const dir = crateDir(root, rust, service)
    const t = performance.now()
    const built = await cargo('build', { root, dir, service, contract })
    if (!built.ok || !built.exe) {
      built.diagnostics.forEach(say)
      s.failure = built.diagnostics.map(d => d.why).join('\n') || `\`${service}\` didn't build`
      overlay(s.failure)
      return
    }
    log(`[weft] ${service}: built in ${Math.round(performance.now() - t)} ms`)
    let next
    try {
      next = await launch({ exe: built.exe, service, hash, listen: '127.0.0.1:0', secret, log, onExit: (code, signal) => exited(service, s, next, code, signal) })
    } catch (e) {
      s.failure = e.message
      log(`[weft] ${e.message}`)
      return overlay(e.message)
    }
    // The swap: new calls go to `next` from here; the old child finishes what it has, then goes.
    const old = s.current
    s.current = next
    s.failure = undefined
    s.exe = built.exe
    s.crashes = 0
    if (old) {
      old.retired = true
      if (old.inflight === 0) stop(old)
    }
  }

  function exited(service, s, child, code, signal) {
    if (closed || !child || child.stopped || s.current !== child) return
    s.current = undefined
    const wait = Math.min(100 * 2 ** (s.crashes = (s.crashes ?? 0) + 1), 5_000)
    log(`[weft] ${service} exited (${signal ?? code}): restarting in ${wait} ms`)
    setTimeout(() => {
      if (closed || s.current || s.building) return
      void rebuild(service) // cargo finds nothing to do, and the binary starts again
    }, wait).unref()
  }

  const watchers = []
  const debounce = (fn, ms = 200) => {
    let t
    return () => { clearTimeout(t); t = setTimeout(fn, ms) }
  }

  for (const service of buildable(contract, rust)) {
    const dir = crateDir(root, rust, service)
    const s = { current: undefined, failure: existsSync(dir) ? undefined : `\`crates/${service}\` doesn't exist`, building: false }
    states.set(service, s)
    const p = await proxy(s)
    s.proxy = p
    process.env[urlVariable(service)] = `http://127.0.0.1:${p.port}`
    if (!existsSync(dir)) {
      log(`[weft] R109 error: ${s.failure}. Point \`rust.services.${service}.crate\` at it, or set \`external: true\``)
      continue
    }
    if (!first.blocked) await rebuild(service)
    const changed = debounce(() => rebuild(service))
    watchers.push(watch(dir, { recursive: true }, (_, file) => {
      if (file && !/^target([\\/]|$)/.test(file) && !file.endsWith('.lock')) changed()
    }))
  }

  // A server module's edit may change a schema: the contract is regenerated, and only a change to a service's hash
  // rebuilds it. cargo then stops where the Rust no longer fits.
  const src = join(root, 'src')
  const contractChanged = debounce(async () => {
    try {
      const fresh = await refresh()
      if (fresh.blocked) return overlay(fresh.blocked.why)
      const before = contract
      contract = fresh.contract
      for (const service of buildable(contract, rust)) {
        if (states.has(service) && before.services?.[service]?.hash !== contract.services[service].hash) void rebuild(service)
      }
    } catch (e) {
      log(`[weft] the contract couldn't be regenerated: ${e.message.split('\n')[0]}`)
    }
  })
  if (existsSync(src)) watchers.push(watch(src, { recursive: true }, (_, file) => {
    if (file && isServerModule(`src/${file.replaceAll('\\', '/')}`)) contractChanged()
  }))

  const killAll = () => {
    closed = true
    for (const s of states.values()) stop(s.current, 1_000)
  }
  process.once('exit', killAll)
  return {
    ready: Object.fromEntries([...states].map(([k, s]) => [k, !!s.current])),
    attach(server) { vite = server },
    async close() {
      process.removeListener('exit', killAll)
      killAll()
      for (const w of watchers) w.close()
      for (const s of states.values()) {
        s.proxy?.agent.destroy()
        s.proxy?.server.closeAllConnections()
        await new Promise(ok => (s.proxy ? s.proxy.server.close(ok) : ok()))
      }
    },
  }
}

// ---- build --------------------------------------------------------------------------------------------------------

const BUILT = ['.weft', 'sidecars'] // a build empties `.output`, and these have to run during it
const SHIPPED = ['.output', 'rust']

/** Release binaries into `.weft/sidecars/`, and what `weft start` needs to run them. */
export async function buildSidecars({ root, contract, rust, log = () => {} }) {
  root = resolve(root)
  const out = join(root, ...BUILT)
  const services = buildable(contract, rust)
  rmSync(out, { recursive: true, force: true })
  if (!services.length) return { services: [], diagnostics: [] }
  mkdirSync(out, { recursive: true })
  const manifest = {}
  const diagnostics = []
  for (const service of services) {
    const dir = crateDir(root, rust, service)
    if (!existsSync(dir)) {
      diagnostics.push({ code: 'R109', severity: 'error', file: 'weft.config.ts', span: [1, 1, 1, 1], why: `\`rust://${service}\` has no crate at \`${relative(root, dir)}\`. Create it, point \`rust.services.${service}.crate\` at it, or set \`external: true\`.` })
      continue
    }
    log(`building ${service}…`)
    const built = await cargo('build', { root, dir, service, contract, release: true })
    if (!built.ok || !built.exe) {
      diagnostics.push(...built.diagnostics)
      continue
    }
    const bin = basename(built.exe)
    copyFileSync(built.exe, join(out, bin))
    manifest[service] = { bin, hash: contract.services[service].hash, bytes: statSync(built.exe).size }
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return { services: Object.keys(manifest), diagnostics }
}

/** Into the output, once the server is built. */
export function shipSidecars(root) {
  const from = join(resolve(root), ...BUILT)
  if (existsSync(from)) cpSync(from, join(resolve(root), ...SHIPPED), { recursive: true })
}

// ---- start --------------------------------------------------------------------------------------------------------

/**
 * Run `.output/rust/`'s binaries for `weft start` (or `built`'s, while `weft build` prerenders). A service with `WEFT_RUST_<NAME>_URL` already set is someone else's.
 * Each keeps its port across restarts, so the server's address stays good.
 * @returns {Promise<{ env: Record<string, string>, close(): void }>} `env` for the server process
 */
export async function startSidecars({ root, built = false, log = console.log }) {
  const dir = join(resolve(root), ...(built ? BUILT : SHIPPED))
  const file = join(dir, 'manifest.json')
  if (!existsSync(file)) return { env: {}, close() {} }
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  const names = Object.keys(manifest).filter(s => !process.env[urlVariable(s)])
  if (!names.length) return { env: {}, close() {} }
  const secret = process.env.WEFT_RUST_SECRET || randomBytes(32).toString('hex')
  const env = { WEFT_RUST_SECRET: secret }
  let closed = false
  const live = new Map()

  const supervise = service => {
    const { bin, hash } = manifest[service]
    let listen = '127.0.0.1:0', tries = 0, up
    const begin = async () => {
      up = Date.now()
      const p = await launch({ exe: join(dir, bin), service, hash, listen, secret, log, onExit: (code, signal) => again(`exited (${signal ?? code})`) })
      listen = `127.0.0.1:${p.port}` // restarts rebind what the first start got
      live.set(service, p)
      return p
    }
    const again = why => {
      if (closed) return
      // One that ran for a while starts over; one that dies at once backs off.
      tries = Date.now() - up > 30_000 ? 1 : tries + 1
      const wait = Math.min(100 * 2 ** tries, 5_000)
      log(`[weft] ${service} ${why}: restarting in ${wait} ms`)
      setTimeout(() => { if (!closed) begin().catch(e => again(e.message.split('\n')[0])) }, wait)
    }
    return begin()
  }

  for (const service of names) env[urlVariable(service)] = (await supervise(service)).url

  const killAll = () => {
    closed = true
    for (const p of live.values()) stop(p, 1_000)
  }
  process.once('exit', killAll)
  return { env, close: killAll }
}
