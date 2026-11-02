// @vitest-environment node
// What shape variants cost (research 31 §9). A component no `pending="shape"` reaches costs nothing: its variant and
// @weft-js/core/shape tree-shake away.
import { fileURLToPath } from 'node:url'
import { brotliCompressSync } from 'node:zlib'
import { build } from 'vite'
import weft from '../vite.mjs'

const src = (f: string) => fileURLToPath(new URL(`../src/${f}`, import.meta.url))
const fixture = (f: string) => fileURLToPath(new URL(`../bench/fixtures/${f}`, import.meta.url))

async function bundle(entry: string) {
  const out = await build({
    root: fixture(''), configFile: false, logLevel: 'silent', plugins: [weft()],
    resolve: { alias: [{ find: /^weft\/(dom|shape)$/, replacement: src('$1.ts') }, { find: /^@weft-js\/core$/, replacement: src('index.ts') }] },
    build: { write: false, modulePreload: { polyfill: false }, rolldownOptions: { input: entry } },
  })
  return [out].flat().flatMap((o: any) => o.output).filter((c: any) => c.type === 'chunk').map((c: any) => c.code).join('\n')
}

test('no pending="shape": no variant and no @weft-js/core/shape in the bundle', async () => {
  const code = await bundle(fixture('shape-none.tsx'))
  expect(code).not.toContain('skeleton')
  expect(code).not.toContain('nnnnn')
}, 60_000)

test('a pending="shape" page pays for what it uses, within the budget', async () => {
  const none = brotliCompressSync(await bundle(fixture('shape-none.tsx'))).length
  const code = await bundle(fixture('shape.tsx'))
  expect(code).toContain('skeleton-scope')
  const used = brotliCompressSync(code).length
  expect(used - none).toBeLessThan(650)
}, 60_000)
