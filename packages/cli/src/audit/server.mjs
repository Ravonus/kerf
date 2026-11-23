// A server-rendered build for the audit: its pages render on request, so it prerenders none (only its share cards),
// and the audit runs the built server the way `kerf start` does and reads its pages from there.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer as createHttpServer, request } from 'node:http'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { diagnostic } from '../diag.mjs'
import { staticRoutes } from './routes.mjs'
import { sleep } from './utils.mjs'

/** The runtime that runs each Nitro server preset Kerf builds (`PRESETS` in start.mjs). */
const RUNTIMES = [
  { preset: /^node/, name: 'node', flags: ['--disable-warning=ExperimentalWarning'] },
  { preset: /^bun/, name: 'bun', flags: ['run'] },
  { preset: /^deno/, name: 'deno', flags: ['run', '-A'] },
]

/**
 * The server a build wrote to `.output`, when this machine can run it: its preset and the command. A host's function
 * (Netlify, Vercel, Cloudflare) has a preset and no server to start here, so `run` is null.
 * @returns {{ preset: string, run: [string, string[]] | null } | null}
 */
export function builtServer(root) {
  const file = join(root, '.output', 'nitro.json')
  if (!existsSync(file)) return null
  let built
  try {
    built = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  const preset = typeof built.preset === 'string' ? built.preset : ''
  const entry = typeof built.serverEntry === 'string' && join(root, '.output', built.serverEntry)
  const runtime = RUNTIMES.find((r) => r.preset.test(preset))
  if (!entry || !existsSync(entry) || !runtime) return { preset, run: null }
  const here = process.versions.deno ? 'deno' : process.versions.bun ? 'bun' : 'node'
  const cmd = runtime.name === here ? process.execPath : runtime.name
  return { preset, run: [cmd, [...runtime.flags, entry]] }
}

const freePort = () =>
  new Promise((ok, no) => {
    const probe = createServer()
    probe.once('error', no)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address())
      probe.close(() => ok(port))
    })
  })

/**
 * The built server on a free local port, with `.env` under what's already set (as `kerf start` runs it). Resolves
 * once it answers, or with why it didn't.
 */
export async function runBuiltServer(root, [cmd, args], { timeout = 20_000 } = {}) {
  const port = String(await freePort())
  const file = join(root, '.env')
  const env = {
    ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}),
    ...process.env,
    ...{ PORT: port, HOST: '127.0.0.1', NITRO_PORT: port, NITRO_HOST: '127.0.0.1' },
  }
  const child = spawn(cmd, args, { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (c) => (stderr = (stderr + c).slice(-2000)))
  let failed = ''
  child.once('error', (e) => (failed = e.message))
  const url = `http://127.0.0.1:${port}`
  const close = () => child.kill()
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
    if (failed || child.exitCode !== null || child.signalCode !== null) break
    try {
      await fetch(`${url}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
      return { url, close }
    } catch {}
  }
  close()
  const said = stderr.trim().split('\n').filter(Boolean).at(-1)
  const why =
    failed ||
    (child.exitCode === null ? 'it did not answer' : `it exited with code ${child.exitCode}`)
  return { error: said ? `${why} (${said.slice(0, 300)})` : why }
}

/** The status each route answers with, 0 for none. */
const statusOf = (url) =>
  fetch(url, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(15_000) }).then(
    (r) =>
      r.arrayBuffer().then(
        () => r.status,
        () => r.status,
      ),
    () => 0,
  )

// A shell build's Nitro peer handles assets and operations while its document belongs to the host.
async function shellPreview(peer, shell, routes) {
  const paths = new Set(routes.map((route) => new URL(route, peer.url).pathname))
  const preview = createHttpServer((req, res) => {
    const path = new URL(req.url, peer.url).pathname
    if (
      paths.has(path) &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      (req.headers['sec-fetch-dest'] === 'document' || req.headers.accept?.includes('text/html'))
    ) {
      return res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(req.method === 'HEAD' ? undefined : shell)
    }
    const upstream = request(
      peer.url,
      { path: req.url, method: req.method, headers: req.headers },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers)
        reply.once('error', (error) => res.destroy(error))
        reply.pipe(res)
      },
    )
    upstream.once('error', (error) => {
      if (res.headersSent) res.destroy(error)
      else res.writeHead(502).end()
    })
    res.once('close', () => upstream.destroy())
    req.pipe(upstream)
  })
  try {
    await new Promise((ok, no) => {
      preview.once('error', no)
      preview.listen(0, '127.0.0.1', ok)
    })
  } catch (error) {
    peer.close()
    throw error
  }
  const { port } = /** @type {import('node:net').AddressInfo} */ (preview.address())
  return {
    url: `http://127.0.0.1:${port}`,
    close() {
      preview.close()
      preview.closeAllConnections()
      peer.close()
    },
  }
}

/**
 * The built server, started, and the pages to audit on it (`routes`, else `pick` of the app's static pages); or `skip`,
 * why there is nothing to audit. A page that needs
 * what the build's environment lacks (a database, a secret) answers 5xx here and not in production: it is left out and
 * named, not failed.
 */
export async function serveBuild(root, dir, { routes, pick, shell }) {
  const built = builtServer(root)
  if (!built)
    return {
      skip: dir
        ? `No prerendered pages in ${dir} and no built server to audit: pass \`--url\` to audit a running site.`
        : 'No build to audit: run `kerf build` first, or pass `--url`.',
    }
  if (!built.run)
    return {
      skip: `The pages render on request, and the \`${built.preset}\` build's server doesn't run on this machine: \`kerf audit --url <deploy>\` audits it running.`,
    }
  const peer = await runBuiltServer(root, built.run)
  if (peer.error)
    return {
      skip: `The pages render on request, and the built server didn't start here: ${peer.error}. Run it with \`kerf start\`, then \`kerf audit --url http://localhost:3000\`.`,
    }
  const listed = routes ?? pick(staticRoutes(root))
  const server = shell ? await shellPreview(peer, shell, listed) : peer
  const answered = []
  const unanswered = []
  for (const route of listed) {
    const status = await statusOf(`${server.url}${route}`)
    if (status === 0 || status >= 500) unanswered.push(`${route} (${status || 'no answer'})`)
    else answered.push(route)
  }
  if (answered.length) return { server, routes: answered, unanswered }
  server.close()
  return {
    skip: `The built server answered no page here (${unanswered.join(', ')}): give the build what its pages read (\`.env\`), or \`kerf audit --url <deploy>\`.`,
  }
}

/** The L000 warning naming the pages the built server couldn't answer at build time. */
export const unansweredPages = (unanswered) =>
  diagnostic({
    code: 'L000',
    severity: 'warning',
    file: 'kerf.config.ts',
    why: `Not audited: the built server answered ${unanswered.join(', ')} here, likely for want of what the page reads (a database, \`.env\`). \`kerf audit --url <deploy>\` audits them running.`,
  })
