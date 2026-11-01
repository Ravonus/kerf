// Three separate production builds, so each frame ships only its own framework.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '../public/arena')
rmSync(out, { recursive: true, force: true })
const plugin = {
  react: async () => (await import('@vitejs/plugin-react')).default(),
  solid: async () => (await import('vite-plugin-solid')).default(),
  weft: async () => (await import('../node_modules/weft/vite.mjs')).default(),
}
const bytes = {}
for (const name of ['react', 'solid', 'weft']) {
  const dir = join(out, name)
  await build({
    root: join(here, name), base: `/arena/${name}/`, logLevel: 'warn', configFile: false,
    plugins: [await plugin[name]()],
    ...(name === 'react' ? { esbuild: { jsx: 'automatic', jsxImportSource: 'react', tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' } } } } : {}),
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { outDir: dir, emptyOutDir: true, assetsDir: '.', cssCodeSplit: false },
  })
  bytes[name] = readdirSync(dir).filter(f => f.endsWith('.js'))
    .reduce((sum, f) => sum + brotliCompressSync(readFileSync(join(dir, f))).length, 0)
  copyFileSync(join(here, name, 'main.tsx'), join(dir, 'source.txt'))
}
mkdirSync(join(out, 'shared'), { recursive: true })
copyFileSync(join(here, 'shared/harness.js'), join(out, 'shared/harness.txt'))
writeFileSync(join(here, '../src/generated/arena.json'), JSON.stringify(bytes) + '\n')
console.log(bytes)
