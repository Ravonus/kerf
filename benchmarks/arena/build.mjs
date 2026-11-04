// Three separate production builds, so each frame ships only its own framework.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '../../site/public/arena')
rmSync(out, { recursive: true, force: true })
const plugin = {
  react: async () => (await import('@vitejs/plugin-react')).default(),
  solid: async () => (await import('vite-plugin-solid')).default(),
  weft: async () => (await import('../../site/node_modules/@weft-js/core/vite.mjs')).default(),
}
const bytes = {}
for (const name of ['react', 'solid', 'weft']) {
  const dir = join(out, name)
  await build({
    root: join(here, name),
    base: `/arena/${name}/`,
    logLevel: 'warn',
    configFile: false,
    plugins: [await plugin[name]()],
    ...(name === 'react'
      ? {
          esbuild: {
            jsx: 'automatic',
            jsxImportSource: 'react',
            tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' } },
          },
        }
      : {}),
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { outDir: dir, emptyOutDir: true, assetsDir: '.', cssCodeSplit: false },
  })
  bytes[name] = readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .reduce((sum, f) => sum + brotliCompressSync(readFileSync(join(dir, f))).length, 0)
  copyFileSync(join(here, name, 'main.tsx'), join(dir, 'source.txt'))
}
// A development build, because the graph's real names are in those only.
await build({
  root: join(here, 'graph'),
  base: '/arena/graph/',
  logLevel: 'warn',
  configFile: false,
  mode: 'development',
  plugins: [
    (await import('../../site/node_modules/@weft-js/core/vite.mjs')).default({ dev: true, hmr: false }),
  ],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true' },
  build: { outDir: join(out, 'graph'), emptyOutDir: true, assetsDir: '.', minify: false },
})
mkdirSync(join(out, 'shared'), { recursive: true })
copyFileSync(join(here, 'shared/harness.js'), join(out, 'shared/harness.txt'))
mkdirSync(join(here, '../../site/src/generated'), { recursive: true }) // a fresh checkout has none
writeFileSync(join(here, '../../site/src/generated/arena.json'), JSON.stringify(bytes) + '\n')
console.log(bytes)
