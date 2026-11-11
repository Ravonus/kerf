// Builds demo/ and serves it. `node test/serve.mjs [port]` keeps it up for a look; test/e2e.mjs imports `serveDemo`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import kerf from '@kerf/core/vite'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = join(pkg, 'demo')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

/** Builds the demo into a temporary folder and serves it on 127.0.0.1. */
export async function serveDemo(port = 0) {
  const out = mkdtempSync(join(tmpdir(), 'kerf-keel-'))
  execFileSync('node', [resolve(pkg, '../cli/bin/kerf.mjs'), 'plugins', 'sync'], {
    cwd: demo,
    stdio: 'pipe',
  })
  await build({
    root: demo,
    configFile: false,
    logLevel: 'error',
    plugins: [kerf()],
    build: { outDir: out, emptyOutDir: true },
  })
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    const file = join(out, path === '/' ? 'index.html' : path)
    if (!file.startsWith(out) || !existsSync(file)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise((done) => {
    server.listen(port, '127.0.0.1', done)
  })
  return {
    out,
    base: `http://127.0.0.1:${server.address().port}`,
    close() {
      server.close()
      rmSync(out, { recursive: true, force: true })
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const served = await serveDemo(Number(process.argv[2] ?? 4179))
  console.log(served.base)
}
