// The sidecar supervisor (research 36 §5): what `kerf dev`, `kerf build`, `kerf start` and `kerf check` do for the Rust
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
// `native()` has no child and no proxy. dev: each build is a new file under `.kerf/native/`, and the manifest beside it
// says which, so the next call loads it in place: an addon can't be unloaded, and needn't be. build: an addon and a
// `.wasm` next to the server, in `.output/server/rust/`, so whatever moves the server moves them too.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest, Agent } from 'node:http'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { makeRefresh } from './sidecar/refresh.mjs'
import { watchServices } from './sidecar/dev-watch.mjs'
import { buildable, isNative } from './sidecar/common.mjs'
import { publisher } from './sidecar/manifest.mjs'
import { devBuilder } from './sidecar/dev-build.mjs'
import { stop } from './sidecar/process.mjs'

/** The app names a sidecar: a server module imports `remote`. Nothing else here runs for an app that doesn't. */
export function usesRemote(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(
    (f) =>
      f.isFile() &&
      /\.[cm]?[jt]sx?$/.test(f.name) &&
      /['"]@kerf\/start\/rust['"]/.test(readFileSync(join(f.parentPath, f.name), 'utf8')),
  )
}

export { crateDir, urlVariable } from './sidecar/common.mjs'

export { cargo, checkWasm, readCargo } from './sidecar/cargo.mjs'

// ---- dev ----------------------------------------------------------------------------------------------------------

/** The stable address the dev server is given: it outlives every child, so a reload moves no one's URL. */
function proxy(state) {
  const agent = new Agent({ keepAlive: true })
  const server = createServer((req, res) => {
    const to = state.current
    if (!to) {
      if (!state.failure) return void res.destroy() // between crash and restart: `remote()` reports it, R107
      res.writeHead(422, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({ ok: false, error: { code: 'Drift', message: state.failure } }),
      )
    }
    to.inflight++
    res.once('close', () => {
      if (--to.inflight === 0 && to.retired) stop(to)
    })
    const up = httpRequest(
      `${to.url}${req.url}`,
      { method: req.method, headers: req.headers, agent },
      (answer) => {
        res.writeHead(answer.statusCode, answer.headers)
        answer.pipe(res)
      },
    )
    up.on('error', () => res.destroy())
    req.pipe(up)
  })
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => ok({ server, agent, port: server.address().port }))
  })
}

/**
 * Build and start every sidecar, and keep them current. Sets `KERF_RUST_<NAME>_URL` and `KERF_RUST_SECRET` in this
 * process before the dev server's worker starts, so it inherits them.
 * @returns {Promise<{ attach(server: import('vite').ViteDevServer): void, close(): Promise<void>, ready: Record<string, any> }>}
 */
export async function devSidecars({ root, site, rust, log = console.log }) {
  root = resolve(root)
  const secret = (process.env.KERF_RUST_SECRET ||= randomBytes(32).toString('hex'))
  const say = (d) =>
    log(`[kerf] ${d.code} ${d.severity}: ${d.why}${d.rendered ? `\n${d.rendered}` : ''}`)
  let vite,
    closed = false
  const overlay = (message) =>
    vite?.ws.send({ type: 'error', err: { message, stack: '', plugin: 'kerf:sidecar' } })
  const refresh = makeRefresh(root, site, rust, say)

  const first = await refresh()
  let contract = first.contract
  const states = new Map()
  const nativeDir = join(root, '.kerf', 'native')
  const publish = publisher(states, nativeDir, () => contract)
  if (buildable(contract, rust).some((k) => isNative(contract, k))) {
    rmSync(nativeDir, { recursive: true, force: true })
    mkdirSync(nativeDir, { recursive: true })
    process.env.KERF_NATIVE_DIR = nativeDir
  }

  const rebuild = devBuilder({
    root,
    rust,
    secret,
    log,
    say,
    overlay,
    states,
    nativeDir,
    publish,
    contract: () => contract,
    closed: () => closed,
  })

  const watchers = await watchServices({
    root,
    rust,
    contract: () => contract,
    setContract: (next) => (contract = next),
    first,
    states,
    proxy,
    publish,
    rebuild,
    refresh,
    overlay,
    log,
  })

  const killAll = () => {
    closed = true
    for (const s of states.values()) stop(s.current, 1_000)
  }
  process.once('exit', killAll)
  return {
    ready: Object.fromEntries([...states].map(([k, s]) => [k, !!(s.current || s.loaded)])),
    attach(server) {
      vite = server
    },
    async close() {
      process.removeListener('exit', killAll)
      killAll()
      for (const w of watchers) w.close()
      for (const s of states.values()) {
        s.proxy?.agent.destroy()
        s.proxy?.server.closeAllConnections()
        await new Promise((ok) => {
          if (s.proxy) s.proxy.server.close(ok)
          else ok()
        })
      }
    },
  }
}

export { buildSidecars, shipSidecars, startSidecars } from './sidecar/build.mjs'
