// Every built compare app at once, to click through: one port each, from 5401 (`vite build` in each first).
//   node serve.mjs [--port 5401]
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const i = process.argv.indexOf('--port')
let port = i > 0 ? Number(process.argv[i + 1]) : 5401
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' }
const apps = [...readdirSync(here).map(d => d), ...readdirSync(join(here, 'design')).map(d => `design/${d}`)]
  .filter(d => existsSync(join(here, d, 'dist/index.html')))

for (const app of apps) {
  const dist = join(here, app, 'dist')
  const at = port++
  createServer((req, res) => {
    let file = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) file = join(dist, 'index.html')
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  }).listen(at, '127.0.0.1', () => console.log(`${app.padEnd(22)} http://localhost:${at}/`))
}
