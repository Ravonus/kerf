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
    root: fixture(''),
    configFile: false,
    logLevel: 'silent',
    plugins: [weft()],
    resolve: {
      alias: [
        { find: /^@weft-js\/core\/(dom|shape)$/, replacement: src('$1.ts') },
        { find: /^@weft-js\/core$/, replacement: src('index.ts') },
      ],
    },
    build: { write: false, modulePreload: { polyfill: false }, rolldownOptions: { input: entry } },
  })
  return ([out].flat() as unknown as { output: { type: string; code: string }[] }[])
    .flatMap((o) => o.output)
    .filter((c) => c.type === 'chunk')
    .map((c) => c.code)
    .join('\n')
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

test('the Vite transform requests route and layout variants without a Boundary', async () => {
  const main = weft({ hmr: false }).find((plugin) => plugin.name === 'weft')
  if (!main) throw new Error('weft transform missing')
  const hook = (main as { transform?: unknown }).transform as {
    handler: (this: object, code: string, id: string, options: object) => Promise<{ code: string }>
  }
  // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
  const context = { resolve: async () => null }
  for (const [file, source] of [
    ['/app/src/routes/index.tsx', 'export default function Page() { return <main>Page</main> }'],
    [
      '/app/src/routes/_layout.tsx',
      'export default function Layout(p) { return <main>{p.children}</main> }',
    ],
  ]) {
    const output = await hook.handler.call(context, source!, file!, {})
    expect(output.code).toContain('as default$shape')
  }
})
