// The sidecar supervisor (research 36 §5): what `weft dev`, `weft build`, `weft start` and `weft check` do for the Rust
// behind `remote()`, and for `native()`'s libraries (research 39). It runs in the CLI, never in the server bundle:
// `remote()` is only `fetch`, so a built server runs anywhere, and a sidecar deployed on its own is one environment
// variable away.
//
//   dev     cargo build, then a stable local proxy in front of the current child. A change under the crate, or a contract
//           change from a server module, builds a new binary, starts it, health-checks it and swaps the proxy; the old
//           child drains and goes. A failed build leaves the old child serving and says why.
//   build   cargo build --release, then the binaries run while Nitro prerenders (a card's `load` may read one), then
//           they go to `.output/rust/`, with a manifest of each one's contract hash.
//   start   each binary on a fixed local port, restarted with backoff if it dies. The web server keeps serving; calls in
//           the gap fail as R107.
//   check   cargo check, with errors mapped to the function they belong to (R103).
//
// `native()` has no child and no proxy. dev: each build is a new file under `.weft/native/`, and the manifest beside it
// says which, so the next call loads it in place: an addon can't be unloaded, and needn't be. build: an addon and a
// `.wasm` next to the server, in `.output/server/rust/`, so whatever moves the server moves them too.

import { spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, Agent } from 'node:http'
import { randomBytes } from 'node:crypto'
import { basename, join, relative, resolve } from 'node:path'
import { writeContract } from './contract.mjs'
import { isServerModule } from './vite.mjs'

/** The app names a sidecar: a server module imports `remote`. Nothing else here runs for an app that doesn't. */
export function usesRemote(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(f => f.isFile() && /\.[cm]?[jt]sx?$/.test(f.name) && /['"]@weft-js\/start\/rust['"]/.test(readFileSync(join(f.parentPath, f.name), 'utf8')))
}

/** Same spelling as `urlVariable` in rust.ts, which can't share a module with this one: it ships in the server bundle. */
export const urlVariable = service => `WEFT_RUST_${service.toUpperCase().replaceAll('-', '_')}_URL`

const external = (rust, service) => rust?.services?.[service]?.external === true
/** The crate folder of a service. */
export const crateDir = (root, rust, service) => resolve(root, rust?.services?.[service]?.crate ?? `crates/${service}`)

/** The services in a contract that have a crate here. */
const buildable = (contract, rust) => Object.keys(contract.services ?? {}).filter(s => !external(rust, s))
const isNative = (contract, service) => contract.services?.[service]?.kind === 'native'
const WASM = 'wasm32-unknown-unknown'

// ---- cargo --------------------------------------------------------------------------------------------------------

function run(cmd, args, { cwd, env, onLine }) {
  return new Promise(ok => {
    let child
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      ok({ code: 127, stdout: '', stderr: e.message, missing: true })
      return
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
  let exe, lib, ok = false
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    if (m.reason === 'compiler-artifact' && m.executable && m.target?.kind?.includes('bin')) exe = m.executable
    if (m.reason === 'compiler-artifact' && m.target?.kind?.includes('cdylib')) lib = m.filenames?.find(f => /\.(dylib|so|dll|wasm)$/.test(f))
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
  return { ok, exe, lib, diagnostics }
}

/** `verb`: `build` or `check`. Failure names what to fix: a build script's panic is already R103 with the fix. */
export async function cargo(verb, { root, dir, service, contract, release, target, onLine }) {
  const args = [verb, '--message-format=json', ...(release ? ['--release'] : []), ...(target ? ['--target', target] : [])]
  const env = { WEFT_CONTRACT: join(root, '.weft', 'contract.json'), ...(target === WASM && { CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS: '-C target-feature=+simd128' }) }
  const r = await run('cargo', args, { cwd: dir, env, onLine })
  if (r.missing) return { ok: false, diagnostics: [{ code: 'R109', severity: 'error', file: 'package.json', span: [1, 1, 1, 1], why: `\`${service}\` is Rust you opted into, so it needs \`cargo\`, and it isn't on PATH. Install it from rustup.rs, or set \`external: true\` for a sidecar built elsewhere. The rest of weft doesn't need Rust.` }] }
  const read = readCargo(r.stdout, { contract, service, root, dir })
  if (r.code === 0) return read
  if (!read.diagnostics.length) {
    const panic = /R103: ([^\n]+)/.exec(r.stderr)?.[1]
    read.diagnostics.push({ code: panic ? 'R103' : 'R109', severity: 'error', file: relative(root, dir).replaceAll('\\', '/') + '/Cargo.toml', span: [1, 1, 1, 1], why: panic ?? `cargo ${verb} failed in \`${service}\`:\n${r.stderr.trim().split('\n').slice(-12).join('\n')}` })
  }
  return { ...read, ok: false }
}

/** R104 for a `.wasm` that won't build: a warning unless the build needs it. `error`: the preset has no other way to run. */
export async function checkWasm({ root, dir, service, contract, preset, rust, build }) {
  if (rust?.services?.[service]?.wasm === false) return { diagnostics: [] }
  const r = await cargo(build ? 'build' : 'check', { root, dir, service, contract, target: WASM, release: build })
  if (r.ok) return { lib: r.lib, diagnostics: [] }
  const missing = r.diagnostics.find(d => /can't find crate for `(std|core)`|target may not be installed/.test(`${d.why}${d.rendered ?? ''}`))
  const why = missing ? `\`rustup target add ${WASM}\`: this toolchain can't build \`${service}\`'s WASM fallback` : `\`${service}\` has no WASM fallback: ${r.diagnostics[0]?.why ?? 'the build failed'}`
  const needed = preset && !/^(node|bun|deno[-_]server)/.test(preset)
  return { diagnostics: [{ code: 'R104', severity: needed ? 'error' : 'warning', file: relative(root, dir).replaceAll('\\', '/') + '/Cargo.toml', span: [1, 1, 1, 1], why: `${why}. An addon loads on this machine, and nothing else can run it. Fix it, or set \`rust.services.${service}.wasm: false\` to say so` }] }
}

const stem = service => service.replaceAll('-', '_')

/** Copy, then rename: macOS kills a process that loads a signed binary overwritten in place. */
function place(from, to) {
  copyFileSync(from, `${to}.tmp`)
  renameSync(`${to}.tmp`, to)
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
    child.stdout.on('data', d => void heard(d))
    const heard = async d => {
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
    }
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
  return new Promise(ok => { server.listen(0, '127.0.0.1', () => ok({ server, agent, port: server.address().port })) })
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
      diagnostics.filter(d => d.code.startsWith('R1')).forEach(say)
      return { contract, blocked: diagnostics.find(d => /^R10[12]$/.test(d.code) && d.severity === 'error') }
    } finally {
      if (held === undefined) delete process.env.WEFT_BUILD
      else process.env.WEFT_BUILD = held
    }
  }

  const first = await refresh()
  let contract = first.contract
  const states = new Map()
  const nativeDir = join(root, '.weft', 'native')
  /** What the server's `native()` reads on each call: one rename, so it never sees half of it. */
  const publish = () => {
    const manifest = Object.fromEntries([...states].filter(([k]) => isNative(contract, k)).map(([k, s]) => [k, s.loaded ?? { hash: '', failure: s.failure ?? `\`${k}\` hasn't built` }]))
    writeFileSync(join(nativeDir, 'manifest.tmp'), JSON.stringify(manifest))
    renameSync(join(nativeDir, 'manifest.tmp'), join(nativeDir, 'manifest.json'))
  }
  if (buildable(contract, rust).some(k => isNative(contract, k))) {
    rmSync(nativeDir, { recursive: true, force: true })
    mkdirSync(nativeDir, { recursive: true })
    process.env.WEFT_NATIVE_DIR = nativeDir
  }

  async function rebuild(service) {
    const s = states.get(service)
    if (s.building) return void (s.again = true)
    s.building = true
    try {
      do {
        s.again = false
        await once(service, s)
        // oxlint-disable-next-line no-unmodified-loop-condition -- `again` and `closed` are set by what arrives during the await
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
    if (!built.ok || !(built.exe || built.lib)) {
      built.diagnostics.forEach(say)
      s.failure = built.diagnostics.map(d => d.why).join('\n') || `\`${service}\` didn't build`
      overlay(s.failure)
      if (isNative(contract, service) && !s.loaded) publish()
      return
    }
    log(`[weft] ${service}: built in ${Math.round(performance.now() - t)} ms`)
    if (isNative(contract, service)) {
      s.generation = (s.generation ?? 0) + 1
      s.loaded = { hash, addon: `${stem(service)}-${s.generation}.node` }
      s.failure = undefined
      place(built.lib, join(nativeDir, s.loaded.addon))
      return publish()
    }
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
    return () => { clearTimeout(t); t = setTimeout(() => fn(), ms) }
  }

  for (const service of buildable(contract, rust)) {
    const dir = crateDir(root, rust, service)
    const s = { current: undefined, failure: existsSync(dir) ? undefined : `\`crates/${service}\` doesn't exist`, building: false }
    states.set(service, s)
    if (!isNative(contract, service)) {
      const p = await proxy(s)
      s.proxy = p
      process.env[urlVariable(service)] = `http://127.0.0.1:${p.port}`
    }
    if (!existsSync(dir)) {
      log(`[weft] R109 error: ${s.failure}. Point \`rust.services.${service}.crate\` at it, or set \`external: true\``)
      if (isNative(contract, service)) publish()
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
    ready: Object.fromEntries([...states].map(([k, s]) => [k, !!(s.current || s.loaded)])),
    attach(server) { vite = server },
    async close() {
      process.removeListener('exit', killAll)
      killAll()
      for (const w of watchers) w.close()
      for (const s of states.values()) {
        s.proxy?.agent.destroy()
        s.proxy?.server.closeAllConnections()
        await new Promise(ok => { if (s.proxy) s.proxy.server.close(ok); else ok() })
      }
    },
  }
}

// ---- build --------------------------------------------------------------------------------------------------------

const BUILT = ['.weft', 'sidecars'] // a build empties `.output`, and these have to run during it
const SHIPPED = ['.output', 'rust']
const SHIPPED_NATIVE = ['.output', 'server', 'rust'] // with the server, so a host that moves it moves these

/** Release binaries into `.weft/sidecars/`, and what `weft start` needs to run them. */
export async function buildSidecars({ root, contract, rust, preset, log = () => {} }) {
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
    if (!built.ok || !(built.exe || built.lib)) {
      diagnostics.push(...built.diagnostics)
      continue
    }
    if (isNative(contract, service)) {
      const addon = `${stem(service)}.${process.platform}-${process.arch}.node`
      copyFileSync(built.lib, join(out, addon))
      manifest[service] = { kind: 'native', addon, hash: contract.services[service].hash, bytes: statSync(built.lib).size }
      const wasm = await checkWasm({ root, dir, service, contract, preset, rust, build: true })
      diagnostics.push(...wasm.diagnostics)
      if (wasm.lib) {
        copyFileSync(wasm.lib, join(out, `${stem(service)}.wasm`))
        Object.assign(manifest[service], { wasm: `${stem(service)}.wasm`, wasmBytes: statSync(wasm.lib).size })
      }
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
  if (!existsSync(from)) return
  const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8'))
  const natives = Object.entries(manifest).filter(([, m]) => m.kind === 'native')
  const sidecars = Object.entries(manifest).filter(([, m]) => m.kind !== 'native')
  const copy = (list, to, names) => {
    if (!list.length) return
    mkdirSync(to, { recursive: true })
    for (const [, m] of list) for (const f of names(m)) cpSync(join(from, f), join(to, f))
    writeFileSync(join(to, 'manifest.json'), JSON.stringify(Object.fromEntries(list), null, 2) + '\n')
  }
  copy(sidecars, join(resolve(root), ...SHIPPED), m => [m.bin])
  copy(natives, join(resolve(root), ...SHIPPED_NATIVE), m => [m.addon, m.wasm].filter(Boolean))
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
  const names = Object.keys(manifest).filter(s => manifest[s].kind !== 'native' && !process.env[urlVariable(s)])
  // While a build prerenders, the libraries aren't next to a server yet.
  const paths = built && Object.values(manifest).some(m => m.kind === 'native') ? { WEFT_NATIVE_DIR: dir } : {}
  if (!names.length) return { env: paths, close() {} }
  const secret = process.env.WEFT_RUST_SECRET || randomBytes(32).toString('hex')
  const env = { ...paths, WEFT_RUST_SECRET: secret }
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
