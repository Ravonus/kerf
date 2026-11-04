// Builds the site's arena apps (benchmarks/arena, read only) for arena/run.mjs: this weft, Solid, React, and a plain DOM frame
// that makes the same writes. `SITE=<site worktree>` adds that site's deployed bundles as `weft-site` and `solid-site`.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '../../../packages/weft')
const from = join(here, '../../arena')
const site = join(here, '../dist/.arena') // a copy, so these resolve against this bench's packages
const out = join(here, '..', process.env.OUT ?? 'dist/arena')
const weft = (await import(join(pkg, 'vite.mjs'))).default
const alias = [
  { find: /^@weft-js\/core\/dom$/, replacement: join(pkg, 'src/dom.ts') },
  { find: /^@weft-js\/core$/, replacement: join(pkg, 'src/index.ts') },
]
const name = process.env.NAME ?? 'weft'
const only = process.env.NAME ? [name] : [name, 'solid', 'react', 'raw']
if (!process.env.NAME) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const dir of ['weft', 'solid', 'react', 'shared'])
  cpSync(join(from, dir), join(site, dir), { recursive: true })
copyFileSync(join(here, 'raw.js'), join(site, 'shared/raw.js'))
// One meter for every frame, kept here: harness.js times each tick, as the deployed page did. `HARNESS=site` keeps the
// site's own, which runs blocks of ticks and so reads like the tight loop.
if (process.env.HARNESS !== 'site')
  copyFileSync(join(here, 'harness.js'), join(site, 'shared/harness.js'))
const frame = (dir) => {
  mkdirSync(dir, { recursive: true })
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'))
  const scripts = js.map((f) => `<script type="module" crossorigin src="./${f}"></script>`).join('')
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>frame</title><link rel="stylesheet" href="../arena.css"><div id="root"></div><script src="../pre.js"></script>${scripts}</html>`,
  )
}
const entry = (which) =>
  ({
    weft: { input: join(site, 'weft/main.tsx'), plugins: [weft()], resolve: { alias } },
    solid: { input: join(site, 'solid/main.tsx'), plugins: [await_solid()] },
    react: {
      input: join(site, 'react/main.tsx'),
      plugins: [await_react()],
      esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    },
    raw: { input: join(site, 'shared/raw.js'), plugins: [] },
  })[which]
const await_solid = (await import('vite-plugin-solid')).default
const await_react = (await import('@vitejs/plugin-react')).default
for (const stack of only) {
  const c = entry(stack === name ? 'weft' : stack)
  await build({
    root: site,
    base: './',
    configFile: false,
    logLevel: 'warn',
    plugins: c.plugins,
    resolve: c.resolve,
    esbuild: c.esbuild,
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: join(out, stack),
      emptyOutDir: true,
      assetsDir: '.',
      modulePreload: false,
      minify: !process.env.NOMIN,
      rollupOptions: {
        input: c.input,
        output: {
          entryFileNames: 'index.js',
          chunkFileNames: 'chunk.js',
          assetFileNames: '[name][extname]',
        },
      },
    },
  })
  frame(join(out, stack))
}
copyFileSync(join(site, 'shared/arena.css'), join(out, 'arena.css'))
copyFileSync(join(here, 'pre.js'), join(out, 'pre.js'))
copyFileSync(join(here, 'index.html'), join(out, 'index.html'))
const deployed = process.env.SITE && join(process.env.SITE, 'site/public/arena')
if (deployed && existsSync(deployed))
  for (const [from, to] of [
    ['weft', 'weft-site'],
    ['solid', 'solid-site'],
  ]) {
    const dir = join(out, to)
    mkdirSync(dir, { recursive: true })
    const js = readdirSync(join(deployed, from)).find((f) => f.endsWith('.js'))
    writeFileSync(join(dir, 'index.js'), readFileSync(join(deployed, from, js)))
    frame(dir)
  }
