// Build dist/ from gen/ (run scripts/specialize.mjs first) and report brotli size per chunk.
//   node scripts/build.mjs [--minifier esbuild|terser] [--out dist] [--json sizes.json] [--engines blink,webkit]
// dist/index.js        detector shell (loads one engine)
// dist/<engine>/engine.js + static chunks = that engine's base chunk
// dist/<engine>/pack-*.js                 = lazy packs
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf('--' + k)
  return i < 0 ? d : args[i + 1]
}
const minifier = opt('minifier', 'esbuild')
const outRoot = path.resolve(root, opt('out', 'dist'))
const engines = opt('engines', 'blink,webkit,gecko').split(',')
const br = (b) =>
  zlib.brotliCompressSync(b, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 },
  }).length
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length
const kb = (n) => (n / 1024).toFixed(2)

function aliasEngine(engine) {
  return {
    name: 'engine-alias',
    setup(b) {
      b.onResolve({ filter: /^@engine\// }, (a) => ({
        path: path.join(root, 'gen', engine, a.path.slice(8).replace(/\.js$/, '.ts')),
      }))
      // gen/ sources import siblings as './x.js'
      b.onResolve({ filter: /^\.\.?\/.*\.js$/ }, (a) => {
        const ts = path.join(a.resolveDir, a.path.replace(/\.js$/, '.ts'))
        return fs.existsSync(ts) ? { path: ts } : undefined
      })
    },
  }
}

async function terserAll(dir) {
  const { minify } = await import('terser')
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const p = path.join(dir, f)
    const r = await minify(fs.readFileSync(p, 'utf8'), {
      module: true,
      ecma: 2020,
      compress: { passes: 3, unsafe_arrows: true, unsafe_methods: true, pure_getters: true },
      mangle: { toplevel: true },
      format: { comments: false },
    })
    fs.writeFileSync(p, r.code)
  }
}

fs.rmSync(outRoot, { recursive: true, force: true })
fs.mkdirSync(outRoot, { recursive: true })
// dist is a derived work of Pretext: its licence and the Chromium, WebKit, ICU and Unicode notices ship with it
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(outRoot, 'LICENSE'))
fs.copyFileSync(path.join(root, 'vendor/pretext/LICENSE'), path.join(outRoot, 'LICENSE-pretext'))
const report = { minifier, engines: {} }
for (const engine of engines) {
  const outdir = path.join(outRoot, engine)
  const r = await esbuild.build({
    entryPoints: {
      engine: path.join(root, engine === 'gecko' ? 'src/engine-exact.ts' : 'src/engine.ts'),
    },
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir,
    metafile: true,
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    charset: 'utf8',
    chunkNames: '[name]-[hash]',
    entryNames: '[name]',
    define: { __ENGINE__: JSON.stringify(engine) },
    plugins: [aliasEngine(engine)],
    logLevel: 'warning',
  })
  if (minifier === 'terser') await terserAll(outdir)
  fs.writeFileSync(path.join(outdir, 'meta.json'), JSON.stringify(r.metafile))
  // static-import closure of each output
  const outs = r.metafile.outputs
  const rel = (p) => path.relative(outdir, path.resolve(root, p))
  const staticDeps = (file, seen = new Set()) => {
    if (seen.has(file)) return seen
    seen.add(file)
    for (const im of outs[file].imports)
      if (im.kind === 'import-statement') staticDeps(im.path, seen)
    return seen
  }
  const files = Object.keys(outs).filter((f) => f.endsWith('.js'))
  const size = (f) => {
    const b = fs.readFileSync(path.resolve(root, f))
    return { raw: b.length, gz: gz(b), br: br(b) }
  }
  const sizes = Object.fromEntries(files.map((f) => [rel(f), size(f)]))
  const entry = files.find((f) => rel(f) === 'engine.js')
  const base = [...staticDeps(entry)]
  // whole-closure brotli (as one response would be, roughly) and sum of per-file brotli (separate requests)
  const sumBr = (list) => list.reduce((a, f) => a + sizes[rel(f)].br, 0)
  // every lazy chunk reachable by dynamic import, each charged only for what its parent tier lacks
  const packs = {}
  const visit = (from, have) => {
    for (const f of from)
      for (const im of outs[f].imports)
        if (im.kind === 'dynamic-import') {
          const name = rel(im.path).replace(/-[A-Z0-9]+\.js$/, '')
          if (packs[name]) continue
          const closure = [...staticDeps(im.path)],
            extra = closure.filter((c) => !have.includes(c))
          packs[name] = { files: extra.map(rel), br: sumBr(extra) }
          visit(closure, [...new Set([...have, ...closure])])
        }
  }
  visit(base, base)
  report.engines[engine] = { base: { files: base.map(rel), br: sumBr(base) }, packs, sizes }
}
// detector shell
const shell = await esbuild.build({
  entryPoints: [path.join(root, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  minify: true,
  target: 'es2020',
  external: ['./blink/engine.js', './webkit/engine.js', './gecko/engine.js'],
  logLevel: 'warning',
})
fs.writeFileSync(path.join(outRoot, 'index.js'), shell.outputFiles[0].contents)
report.shell = { br: br(shell.outputFiles[0].contents), raw: shell.outputFiles[0].contents.length }

console.log(`minifier: ${minifier}; detector shell dist/index.js: ${kb(report.shell.br)} KB br`)
for (const [e, r] of Object.entries(report.engines)) {
  console.log(
    `\n${e}: base ${kb(r.base.br + report.shell.br)} KB br (shell + ${r.base.files.join(' + ')})`,
  )
  for (const [p, v] of Object.entries(r.packs))
    console.log(
      `  lazy ${p.padEnd(14)} ${kb(v.br).padStart(6)} KB br  (${v.files.join(' + ') || 'nothing new'})`,
    )
}
const jsonOut = opt('json', null)
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1))
