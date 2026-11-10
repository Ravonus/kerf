// @vitest-environment node
// `style={{…}}` with fixed values costs what a literal style does, and `csp: 'strict'` turns fixed styles into
// generated classes, so the page needs no style attribute or inline style at all.
import { join } from 'node:path'
import { build } from 'vite'
import weft from '../vite.mjs'

const entry = join(import.meta.dirname, 'fixtures/csp/main.tsx')

async function built(options: Parameters<typeof weft>[0]) {
  const out = await build({
    root: join(import.meta.dirname, 'fixtures/csp'),
    configFile: false,
    logLevel: 'silent',
    plugins: [weft({ ...options, purge: false })],
    resolve: {
      alias: [
        { find: /^@weft-js\/core\/dom$/, replacement: join(import.meta.dirname, '../src/dom.ts') },
        { find: /^@weft-js\/core$/, replacement: join(import.meta.dirname, '../src/index.ts') },
      ],
    },
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      rolldownOptions: { input: entry },
    },
  })
  const files = [out].flat().flatMap((o) => ('output' in o ? o.output : []))
  const text = (type: string) =>
    files
      .filter((f) => f.fileName.endsWith(type))
      .map((f) => ('code' in f ? f.code : String(f.source)))
      .join('\n')
  return { js: text('.js'), css: text('.css') }
}

test('a style object with fixed values goes in the template, with no binding', async () => {
  const { js } = await built({})
  expect(js).toContain('style=\\"color:red;font-size:12px\\"')
  expect(js).toContain('style=\\"padding:8px\\"')
  // Only the opacity, which changes, is still written at run time.
  expect(js).toMatch(/\{\s*opacity:/)
  expect(js).not.toMatch(/\{\s*color:\s*"red"/)
})

test("csp: 'strict' moves fixed styles into a stylesheet as classes", async () => {
  const { js, css } = await built({ csp: 'strict' })
  expect(js).not.toMatch(/style=\\"/)
  expect(js).toMatch(/class=\\"lead ws-[0-9a-f]{8}\\"/)
  expect(js).toMatch(/<main class=\\"ws-[0-9a-f]{8}\\"/)
  // A class written at run time can't take a generated one: that style is one CSSOM write instead.
  expect(js).toContain('.style.cssText = "margin:0"')
  expect(css).toMatch(
    /\.ws-[0-9a-f]{8}\s*\{\s*color:\s*red\s*!important;\s*font-size:\s*12px\s*!important/,
  )
  expect(css).toMatch(/\.ws-[0-9a-f]{8}\s*\{\s*padding:\s*8px\s*!important/)
})
