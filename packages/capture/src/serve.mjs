// A static server for a built page, on 127.0.0.1, so the drivers can open a `dist` folder as a site.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

/** Serves the files under `dir` on a free port (or `port`). A folder answers with its `index.html`. */
export async function serve(dir, port = 0) {
  const root = resolve(dir)
  const server = createServer((req, res) => {
    let file = join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if ((file !== root && !file.startsWith(root + sep)) || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    const type = TYPES[extname(file)]
    res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise((done) => {
    server.listen(port, '127.0.0.1', () => done(undefined))
  })
  const address = server.address()
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((done) => {
        server.close(() => done(undefined))
      }),
  }
}
