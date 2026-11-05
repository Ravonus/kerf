// Production servers on ports nothing else owns. A stale one fooled a run once, so a server has to prove it's this build:
// the run's canary file answers, and every JS and CSS file a measurement touches hashes to something the build wrote.
import { sleep as wait } from '../../scripts/lib/helpers.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

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
  const t0 = performance.now()
  for (;;) {
    if (exited !== null)
      throw new Error(`${v.name}: server exited (${exited}) before answering, see ${v.log}`)
    if (performance.now() - t0 > 30000) {
      kill('SIGKILL')
      throw new Error(`${v.name}: server didn't answer on ${url} in 30s, see ${v.log}`)
    }
    try {
      if ((await fetch(url + firstPage, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch {}
    await wait(50)
  }
  const server = {
    url,
    port,
    pid: child.pid,
    bootMs: performance.now() - t0,
    seen: new Map(),
    alive: () => exited === null,
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

/** Working sets across the server's process tree, in MB: Windows has neither `ps` nor groups. */
function treeMB(root) {
  const script =
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }'
  const all = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(' ').map(Number))
  const tree = new Set([root])
  for (let grew = true; grew;) {
    grew = false
    for (const [pid, parent] of all)
      if (tree.has(parent) && !tree.has(pid)) {
        tree.add(pid)
        grew = true
      }
  }
  return all.filter(([pid]) => tree.has(pid)).reduce((n, p) => n + p[2], 0) / 1048576
}

/** Sum of resident memory across the server's process group, in MB. */
export function rssMB(server) {
  try {
    if (windows) return treeMB(server.pid)
    return (
      execFileSync('ps', ['-axo', 'pgid=,rss='], { encoding: 'utf8' })
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .filter(([g]) => +g === server.pid)
        .reduce((n, [, r]) => n + +r, 0) / 1024
    )
  } catch {
    return null
  }
}

// ---- Run as a script: the static host for a variant with no server of its own, brotli then gzip, from memory like a CDN.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2]
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.txt': 'text/plain',
    '.ico': 'image/x-icon',
  }
  const cache = new Map()
  const entry = (p) => {
    if (cache.has(p)) return cache.get(p)
    const raw = readFileSync(p),
      type = TYPES[extname(p)] ?? 'application/octet-stream',
      text = /^(text|application\/json|image\/svg)/.test(type)
    const e = {
      raw,
      type,
      br: text
        ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
        : null,
      gz: text ? gzipSync(raw, { level: 9 }) : null,
      immutable: dirname(p).endsWith('assets'),
    }
    cache.set(p, e)
    return e
  }
  createServer((q, r) => {
    let p = normalize(join(dist, decodeURIComponent(q.url.split('?')[0])))
    if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory())
      p = join(dist, 'index.html')
    const e = entry(p),
      ae = q.headers['accept-encoding'] ?? '',
      enc = e.br && /\bbr\b/.test(ae) ? 'br' : e.gz && /gzip/.test(ae) ? 'gz' : null
    r.writeHead(200, {
      'content-type': e.type,
      'cache-control': e.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(enc ? { 'content-encoding': enc === 'br' ? 'br' : 'gzip', vary: 'accept-encoding' } : {}),
    })
    r.end(enc ? e[enc] : e.raw)
  }).listen(+process.env.PORT, process.env.HOST)
}
