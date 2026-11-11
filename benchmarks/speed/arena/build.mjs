// Builds the site's arena apps (benchmarks/arena, read only) for arena/run.mjs: this kerf, Solid, React, and a plain DOM frame
// that makes the same writes. `SITE=<site worktree>` adds that site's deployed bundles as `kerf-site` and `solid-site`.
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
const pkg = join(here, '../../../packages/core')
const from = join(here, '../../arena')
const site = join(here, '../dist/.arena') // a copy, so these resolve against this bench's packages
const out = join(here, '..', process.env.OUT ?? 'dist/arena')
const kerf = (await import(join(pkg, 'vite.mjs'))).default
const alias = [
  { find: /^@kerf\/core\/dom$/, replacement: join(pkg, 'src/dom.ts') },
  { find: /^@kerf\/core$/, replacement: join(pkg, 'src/index.ts') },
]
const name = process.env.NAME ?? 'kerf'
const only = process.env.NAME ? [name] : [name, 'solid', 'react', 'raw']
if (!process.env.NAME) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const dir of ['kerf', 'solid', 'react', 'shared'])
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
    kerf: { input: join(site, 'kerf/main.tsx'), plugins: [kerf()], resolve: { alias } },
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
  const c = entry(stack === name ? 'kerf' : stack)
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
    ['kerf', 'kerf-site'],
    ['solid', 'solid-site'],
  ]) {
    const dir = join(out, to)
    mkdirSync(dir, { recursive: true })
    const js = readdirSync(join(deployed, from)).find((f) => f.endsWith('.js'))
    writeFileSync(join(dir, 'index.js'), readFileSync(join(deployed, from, js)))
    frame(dir)
  }
