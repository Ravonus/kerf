import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
} from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const types = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
}
/** A real app uses only media(), mediaFfmpeg(), ?media imports and the standard Media renderer. */
function writeFixture(root) {
  mkdirSync(join(root, 'node_modules/@kerf-js'), { recursive: true })
  for (const name of ['core', 'media', 'media-ffmpeg'])
    symlinkSync(join(repo, 'packages', name), join(root, 'node_modules/@kerf-js', name))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'automatic-media-proof',
      type: 'module',
      private: true,
      dependencies: {
        '@kerf-js/core': '0.1.0',
        '@kerf-js/media': '0.1.0',
        '@kerf-js/media-ffmpeg': '0.1.0',
      },
    }),
  )
  writeFileSync(
    join(root, 'kerf.config.ts'),
    `import {defineConfig} from '@kerf-js/core/config';import {media} from '@kerf-js/media';import {mediaFfmpeg} from '@kerf-js/media-ffmpeg';export default defineConfig({plugins:[media({quality:{scorer:'none'},video:{codecs:[]}}),mediaFfmpeg()]});`,
  )
  writeFileSync(
    join(root, 'index.html'),
    '<div id="app"></div><style>body{margin:24px}video{width:620px;max-width:100%;display:block}.gap{height:1600px}</style><script type="module" src="/main.tsx"></script>',
  )
  writeFileSync(
    join(root, 'main.tsx'),
    `import {render} from '@kerf-js/core/dom';import {Media} from '@kerf-js/core/media';import foreground from './foreground.mp4?media';import distant from './distant.mp4?media';render(()=> <><Media src={foreground} alt="Foreground" muted autoplay loop priority/><div class="gap"/><Media src={distant} alt="Distant" muted loop/></>,document.getElementById('app'));`,
  )
}
async function buildFixture(root) {
  writeFixture(root)
  for (const [name, filter] of [
    ['foreground', 'testsrc2'],
    ['distant', 'smptebars'],
  ])
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `${filter}=size=960x540:rate=12:duration=2`,
      '-c:v',
      'libx264',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-threads',
      '2',
      join(root, name + '.mp4'),
    ])
  for (const args of [
    ['plugins', 'approve', '@kerf-js/media'],
    ['plugins', 'approve', '@kerf-js/media-ffmpeg'],
    ['plugins', 'sync'],
    ['agents-md'],
  ])
    execFileSync(
      process.execPath,
      [join(repo, 'packages/cli/bin/kerf.mjs'), ...args, '--root', root],
      { stdio: 'pipe' },
    )
  const require = createRequire(join(repo, 'packages/core/package.json')),
    { build } = require('vite'),
    kerf = (await import(new URL('../../../core/vite.mjs', import.meta.url))).default
  await build({
    root,
    configFile: false,
    plugins: [kerf()],
    build: { outDir: join(root, 'dist'), emptyOutDir: true },
    logLevel: 'silent',
  })
  return { root, agents: readFileSync(join(root, 'AGENTS.md'), 'utf8') }
}
/** Remove owned intermediate files even when a production build fails. */
export async function automaticFixture() {
  const root = mkdtempSync(join(tmpdir(), 'kerf-auto-media-'))
  try {
    return await buildFixture(root)
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}
/** Immutable responses and standard byte ranges model production media cache behavior. */
export async function automaticServer(root) {
  const transfers = []
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname,
      file = join(root, pathname === '/' ? 'index.html' : pathname)
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404)
      res.end()
      return
    }
    if (file.endsWith('.mp4')) transfers.push(pathname)
    const data = readFileSync(file)
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    res.setHeader(
      'Cache-Control',
      file.endsWith('.html') ? 'no-cache' : 'public,max-age=31536000,immutable',
    )
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
    if (range) {
      const start = +range[1],
        end = Math.min(range[2] ? +range[2] : data.length - 1, data.length - 1)
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      })
      res.end(data.subarray(start, end + 1))
    } else {
      res.setHeader('Content-Length', data.length)
      res.end(data)
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    transfers,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
      }),
  }
}
