// Production servers on ports nothing else owns. A stale one fooled a run once, so a server has to prove it's this build:
// the run's canary file answers, and every JS and CSS file a measurement touches hashes to something the build wrote.
import { sleep as wait } from '../../scripts/lib/helpers.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from './serve-static.mjs'
import { waitReady } from './serve-ready.mjs'
export { rssMB } from './serve-memory.mjs'

const freePort = () =>
  new Promise((ok, no) => {
    const s = createServer()
    s.on('error', no)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
const windows = process.platform === 'win32'

/** A path for a command line that goes through the shell: cmd takes no JSON escapes. */
export const quote = (p) => (windows ? `"${p}"` : JSON.stringify(p))

/** A server and whatever wraps it. Windows has no process groups and no SIGTERM to give a server time, so there it's the tree, by force. */
function killTree(pid, signal) {
  try {
    if (!windows) process.kill(-pid, signal)
    else if (signal === 'SIGKILL')
      execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' })
  } catch {}
}

/** What's listening on a port: a server whose wrapper died first is out of taskkill's reach, and a leaked one ruins the next run. */
const listeners = (port) =>
  [
    ...execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true }).matchAll(
      new RegExp(String.raw`^\s*TCP\s+\S*:${port}\s+\S+\s+LISTENING\s+(\d+)`, 'gm'),
    ),
  ].map((m) => m[1])

function launch(v, cmd, port, url) {
  const log = createWriteStream(v.log, { flags: 'a' })
  // Its own process group: `npm run start` wraps the server, and only killing the group takes both down. Windows: killTree.
  const child = spawn(cmd, {
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
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let exited = null
  child.on('exit', (code) => (exited = code ?? 'signal'))
  // Windows reuses a pid at once, and taskkill /T would take a stranger's whole tree.
  const kill = (signal) => {
    if (!windows || exited === null) killTree(child.pid, signal)
  }
  // Whatever ends the run, the server ends with it.
  process.on('exit', () => kill('SIGKILL'))
  return { child, log, kill, alive: () => exited === null }
}

export async function startServer(v, firstPage, { proveBuild = true } = {}) {
  const port = await freePort(),
    url = `http://127.0.0.1:${port}`
  let answered = true
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) })
  } catch {
    answered = false
  }
  if (answered)
    throw new Error(`port ${port} already answers: refusing to measure someone else's server`)
  const out = !v.start && v.stack.out.find((d) => existsSync(join(v.root, d, 'index.html')))
  if (!v.start && !out)
    throw new Error(`${v.name}: no start script and no index.html in ${v.stack.out.join(', ')}`)
  const cmd =
    v.start ??
    `${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))} ${quote(join(v.root, out))}`
  const { child, log, kill, alive, exit } = launch(v, cmd, port, url)
  const t0 = performance.now()
  await waitReady({ v, url, firstPage, kill, alive, exit, t0 })
  const server = {
    url,
    port,
    pid: child.pid,
    bootMs: performance.now() - t0,
    seen: new Map(),
    alive,
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

// Keep the static host entry at this public path.
if (process.argv[1] === fileURLToPath(import.meta.url)) serveStatic(process.argv[2])
