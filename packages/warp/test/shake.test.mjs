// @vitest-environment node
// An app that draws no chart pays nothing for charts (06 §2), and one form doesn't bring the others.
import { build } from 'vite'
import weft from 'weft/vite'

async function bundle(jsx, names) {
  const id = '\0shake-entry.tsx'
  const code = `import { render } from 'weft/dom'\nimport { ${names} } from '@weft/warp'\nrender(() => ${jsx}, document.body)\n`
  const out = await build({
    configFile: false, logLevel: 'silent', root: new URL('..', import.meta.url).pathname,
    plugins: [weft(), { name: 'entry', resolveId: s => (s === 'shake-entry.tsx' ? id : null), load: i => (i === id ? code : null) }],
    build: { write: false, cssCodeSplit: false, modulePreload: false, rolldownOptions: { input: 'shake-entry.tsx' } },
  })
  const files = (Array.isArray(out) ? out : [out]).flatMap(o => o.output)
  return { js: files.filter(f => f.type === 'chunk').map(f => f.code).join('\n'), css: files.filter(f => f.fileName.endsWith('.css')).map(f => String(f.source)).join('\n') }
}

test('no chart imported: no chart JS, no chart CSS', async () => {
  const { js, css } = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['chart-tip', 'aria-roledescription', 'tip-row', 'monotone', 'view-toggle']) expect(js, word).not.toContain(word)
  for (const word of ['chart', 'legend', 'warp-draw', '--warp-data-line']) expect(css, word).not.toContain(word)
}, 60000)

test('one form brings its own layout, not the others', async () => {
  const { js } = await bundle('<DonutChart title="T" data={[{ name: "A", value: 1 }]} />', 'DonutChart')
  expect(js).toContain('donut chart')
  for (const kind of ['line chart', 'sankey diagram', 'treemap', 'candlestick chart', 'streaming line chart']) expect(js, kind).not.toContain(kind)
}, 60000)

test('an app pays for the flows it uses: SignIn brings no calendar, chat or checkout, and a Button no pack at all', async () => {
  const button = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['warp-arrive', 'data-scope="auth"', 'data-scope="calendar"']) expect(button.js + button.css, word).not.toContain(word)
  const signIn = await bundle('<SignIn />', 'SignIn')
  for (const scope of ['"calendar"', '"thread"', '"checkout"', '"room"', '"tool-call"']) expect(signIn.js, scope).not.toContain(scope)
  for (const scope of ['data-scope="calendar"', 'data-scope="checkout"', 'data-scope="tool-call"']) expect(signIn.css, scope).not.toContain(scope)
}, 90000)

test('a Button pays nothing for the windows; a list brings its window, not chat, board or grid', async () => {
  const plain = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['overflowAnchor', 'aria-setsize', 'data-probe']) expect(plain.js, word).not.toContain(word)
  for (const word of ['scroll-grid', 'data-scope="virtual"']) expect(plain.css, word).not.toContain(word)
  const list = await bundle('<VirtualList items={[]} rowKey={r => r}>{r => <span />}</VirtualList>', 'VirtualList')
  expect(list.js).toContain('overflowAnchor')
  for (const word of ['Jump to latest', 'Page Up and Page Down', 'data-dragging']) expect(list.js, word).not.toContain(word)
  for (const word of ['scroll-grid', 'column-head', 'data-scope="composer"']) expect(list.css, word).not.toContain(word)
}, 60000)
