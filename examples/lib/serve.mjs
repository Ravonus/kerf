// Production servers on ports nothing else owns. A stale one fooled a run once, so a server has to prove it's this build:
// the run's canary file answers, and every JS and CSS file a measurement touches hashes to something the build wrote.
import { sleep as wait } from '../../scripts/lib/helpers.mjs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { killTree, listeners, quote, windows } from './serve/tree.mjs'

export { quote, rssMB } from './serve/tree.mjs'

const freePort = () =>
  new Promise((ok, no) => {
    const s = createServer()
    s.on('error', no)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
async function assertPortFree(port, url) {
  let answered = true
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) })
  } catch {
    answered = false
  }
  if (answered)
    throw new Error(`port ${port} already answers: refusing to measure someone else's server`)
}

function serverCommand(v) {
  const out = !v.start && v.stack.out.find((d) => existsSync(join(v.root, d, 'index.html')))
  if (!v.start && !out)
    throw new Error(`${v.name}: no start script and no index.html in ${v.stack.out.join(', ')}`)
  const host = fileURLToPath(new URL('./serve/static-host.mjs', import.meta.url))
  return v.start ?? `${quote(process.execPath)} ${quote(host)} ${quote(join(v.root, out))}`
}

function spawnServer(v, cmd, port, url) {
  // Its own process group: `npm run start` wraps the server, and only killing the group takes both down. Windows: killTree.
  return spawn(cmd, {
    cwd: v.root,
    shell: true,
    detached: !windows,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ...v.buildEnv,
      PORT: String(port),
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      ...(v.dbEnv && { BETTER_AUTH_URL: url }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForAnswer({ v, url, firstPage, st, kill }) {
  const t0 = performance.now()
  for (;;) {
    if (st.exited !== null)
      throw new Error(`${v.name}: server exited (${st.exited}) before answering, see ${v.log}`)
    if (performance.now() - t0 > 30000) {
      kill('SIGKILL')
      throw new Error(`${v.name}: server didn't answer on ${url} in 30s, see ${v.log}`)
    }
    try {
      if ((await fetch(url + firstPage, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch {}
    await wait(50)
  }
  return performance.now() - t0
}

export async function startServer(v, firstPage, { proveBuild = true } = {}) {
  const port = await freePort(),
    url = `http://127.0.0.1:${port}`
  await assertPortFree(port, url)
  const log = createWriteStream(v.log, { flags: 'a' })
  const child = spawnServer(v, serverCommand(v), port, url)
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  const st = { exited: null }
  child.on('exit', (code) => (st.exited = code ?? 'signal'))
  // Windows reuses a pid at once, and taskkill /T would take a stranger's whole tree.
  const kill = (signal) => {
    if (!windows || st.exited === null) killTree(child.pid, signal)
  }
  // Whatever ends the run, the server ends with it.
  process.on('exit', () => kill('SIGKILL'))
  const bootMs = await waitForAnswer({ v, url, firstPage, st, kill })
  const server = {
    url,
    port,
    pid: child.pid,
    bootMs,
    seen: new Map(),
    alive: () => st.exited === null,
    stop: async () => {
      kill('SIGTERM')
      await wait(200)
      kill('SIGKILL')
      if (windows) for (const pid of listeners(port)) killTree(pid, 'SIGKILL')
      log.end()
    },
  }
  if (proveBuild) await assertFresh(v, server)
  return server
}

export async function assertFresh(v, server, paths = []) {
  if (!server.alive()) throw new Error(`${v.name}: server died mid-run, see ${v.log}`)
  const r = await fetch(`${server.url}/${v.canary}`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok || (await r.text()) !== v.canary.slice(8, -4))
    throw new Error(`${v.name}: STALE: ${server.url} doesn't serve this run's canary`)
  for (const p of paths) {
    if (server.seen.has(p)) continue
    const a = await fetch(server.url + p, { headers: { 'accept-encoding': 'identity' } })
    const h = createHash('sha256')
      .update(Buffer.from(await a.arrayBuffer()))
      .digest('hex')
    if (!a.ok || !v.fresh.hashes.has(h))
      throw new Error(`${v.name}: STALE: ${p} isn't in this build's output (status ${a.status})`)
    server.seen.set(p, h)
  }
  return { canary: true, verified: server.seen.size }
}
