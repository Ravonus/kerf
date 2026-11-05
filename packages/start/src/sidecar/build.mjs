import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, join, relative, resolve } from 'node:path'
import { cargo, checkWasm } from './cargo.mjs'
import { launch, stop } from './process.mjs'
import { buildable, crateDir, isNative, stem, urlVariable } from './common.mjs'

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
      diagnostics.push({
        code: 'R109',
        severity: 'error',
        file: 'weft.config.ts',
        span: [1, 1, 1, 1],
        why: `\`rust://${service}\` has no crate at \`${relative(root, dir)}\`. Create it, point \`rust.services.${service}.crate\` at it, or set \`external: true\`.`,
      })
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
      manifest[service] = {
        kind: 'native',
        addon,
        hash: contract.services[service].hash,
        bytes: statSync(built.lib).size,
      }
      const wasm = await checkWasm({ root, dir, service, contract, preset, rust, build: true })
      diagnostics.push(...wasm.diagnostics)
      if (wasm.lib) {
        copyFileSync(wasm.lib, join(out, `${stem(service)}.wasm`))
        Object.assign(manifest[service], {
          wasm: `${stem(service)}.wasm`,
          wasmBytes: statSync(wasm.lib).size,
        })
      }
      continue
    }
    const bin = basename(built.exe)
    copyFileSync(built.exe, join(out, bin))
    manifest[service] = {
      bin,
      hash: contract.services[service].hash,
      bytes: statSync(built.exe).size,
    }
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
    writeFileSync(
      join(to, 'manifest.json'),
      JSON.stringify(Object.fromEntries(list), null, 2) + '\n',
    )
  }
  copy(sidecars, join(resolve(root), ...SHIPPED), (m) => [m.bin])
  copy(natives, join(resolve(root), ...SHIPPED_NATIVE), (m) => [m.addon, m.wasm].filter(Boolean))
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
  const names = Object.keys(manifest).filter(
    (s) => manifest[s].kind !== 'native' && !process.env[urlVariable(s)],
  )
  // While a build prerenders, the libraries aren't next to a server yet.
  const paths =
    built && Object.values(manifest).some((m) => m.kind === 'native')
      ? { WEFT_NATIVE_DIR: dir }
      : {}
  if (!names.length) return { env: paths, close() {} }
  const secret = process.env.WEFT_RUST_SECRET || randomBytes(32).toString('hex')
  const env = { ...paths, WEFT_RUST_SECRET: secret }
  let closed = false
  const live = new Map()

  const supervise = (service) => {
    const { bin, hash } = manifest[service]
    let listen = '127.0.0.1:0',
      tries = 0,
      up
    const begin = async () => {
      up = Date.now()
      const p = await launch({
        exe: join(dir, bin),
        service,
        hash,
        listen,
        secret,
        log,
        onExit: (code, signal) => again(`exited (${signal ?? code})`),
      })
      listen = `127.0.0.1:${p.port}` // restarts rebind what the first start got
      live.set(service, p)
      return p
    }
    const again = (why) => {
      if (closed) return
      // One that ran for a while starts over; one that dies at once backs off.
      tries = Date.now() - up > 30_000 ? 1 : tries + 1
      const wait = Math.min(100 * 2 ** tries, 5_000)
      log(`[weft] ${service} ${why}: restarting in ${wait} ms`)
      setTimeout(() => {
        if (!closed) begin().catch((e) => again(e.message.split('\n')[0]))
      }, wait)
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
