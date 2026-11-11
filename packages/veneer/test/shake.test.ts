// @vitest-environment node
// An app that draws no chart pays nothing for charts (06 §2), and one form doesn't bring the others.
import { build } from 'vite'
import kerf from '@kerf-js/core/vite'

async function bundle(jsx: string, names: string) {
  const id = '\0shake-entry.tsx'
  const code = `import { render } from '@kerf-js/core/dom'\nimport { ${names} } from '@kerf-js/veneer'\nrender(() => ${jsx}, document.body)\n`
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    root: new URL('..', import.meta.url).pathname,
    plugins: [
      kerf(),
      {
        name: 'entry',
        resolveId: (s) => (s === 'shake-entry.tsx' ? id : null),
        load: (i) => (i === id ? code : null),
      },
    ],
    build: {
      write: false,
      cssCodeSplit: false,
      modulePreload: false,
      rolldownOptions: { input: 'shake-entry.tsx' },
    },
  })
  const files = (Array.isArray(out) ? out : [out]).flatMap(
    (o) => (o as Extract<typeof o, { output: unknown }>).output,
  )
  return {
    js: files
      .filter((f) => f.type === 'chunk')
      .map((f) => f.code)
      .join('\n'),
    css: files
      .filter((f) => f.fileName.endsWith('.css'))
      .map((f) => String((f as Extract<typeof f, { type: 'asset' }>).source))
      .join('\n'),
  }
}

test('no chart imported: no chart JS, no chart CSS', async () => {
  const { js, css } = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['chart-tip', 'aria-roledescription', 'tip-row', 'monotone', 'view-toggle'])
    expect(js, word).not.toContain(word)
  for (const word of ['chart-', 'legend', 'veneer-draw', '--veneer-data-line'])
    expect(css, word).not.toContain(word)
}, 60000)

test('one form brings its own layout, not the others', async () => {
  const { js } = await bundle(
    '<DonutChart title="T" data={[{ name: "A", value: 1 }]} />',
    'DonutChart',
  )
  expect(js).toContain('donut chart')
  for (const kind of [
    'line chart',
    'sankey diagram',
    'treemap',
    'candlestick chart',
    'streaming line chart',
  ])
    expect(js, kind).not.toContain(kind)
}, 60000)

test('an app pays for the flows it uses: SignIn brings no calendar, chat or checkout, and a Button no pack at all', async () => {
  const button = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['veneer-arrive', 'data-scope="auth"', 'data-scope="calendar"'])
    expect(button.js + button.css, word).not.toContain(word)
  const signIn = await bundle('<SignIn />', 'SignIn')
  for (const scope of ['"calendar"', '"thread"', '"checkout"', '"room"', '"tool-call"'])
    expect(signIn.js, scope).not.toContain(scope)
  for (const scope of ['data-scope="calendar"', 'data-scope="checkout"', 'data-scope="tool-call"'])
    expect(signIn.css, scope).not.toContain(scope)
}, 90000)

test('a Button pays nothing for the windows; a list brings its window, not chat, board or grid', async () => {
  const plain = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['overflowAnchor', 'aria-setsize', 'data-probe'])
    expect(plain.js, word).not.toContain(word)
  for (const word of ['scroll-grid', 'data-scope="virtual"'])
    expect(plain.css, word).not.toContain(word)
  const list = await bundle(
    '<VirtualList items={[]} rowKey={r => r}>{r => <span />}</VirtualList>',
    'VirtualList',
  )
  expect(list.js).toContain('overflowAnchor')
  for (const word of ['Jump to latest', 'Page Up and Page Down', 'data-dragging'])
    expect(list.js, word).not.toContain(word)
  for (const word of ['scroll-grid', 'column-head', 'data-scope="composer"'])
    expect(list.css, word).not.toContain(word)
}, 60000)

test('a button pays nothing for canvas or dither; a Canvas brings no dither engine', async () => {
  const plain = await bundle('<Button>Save</Button>', 'Button')
  for (const word of ['data-fx-offscreen', 'putImageData', 'veneer-dither', 'Path2D'])
    expect(plain.js + plain.css, word).not.toContain(word)
  for (const word of [
    'data-scope="dither"',
    'data-scope=dither',
    'data-scope="canvas"',
    'data-scope=canvas',
  ])
    expect(plain.css, word).not.toContain(word)
  const canvas = await bundle('<Canvas draw={() => {}} />', 'Canvas')
  expect(canvas.js).toContain('data-fx-offscreen')
  for (const word of ['putImageData', 'Path2D']) expect(canvas.js, word).not.toContain(word)
}, 60000)

/** The CSS without its `:not(…)` fences: what's left is what the rules select. */
function unfenced(css: string) {
  let out = '',
    i = 0
  for (let at = css.indexOf(':not(', i); at !== -1; at = css.indexOf(':not(', i)) {
    out += css.slice(i, at)
    let depth = 0
    for (i = at + 4; i < css.length; i++)
      if (css[i] === '(') depth++
      else if (css[i] === ')' && --depth === 0) break
    i++
  }
  return out + css.slice(i)
}

test('a dither brings its own CSS and the inks it can name, and no field or signature rules', async () => {
  const { css } = await bundle('<DitherField />', 'DitherField')
  expect(css).toContain('[data-scope=dither]')
  for (const token of [
    '--veneer-color-accent-soft',
    '--veneer-color-critical-border',
    '--veneer-color-text',
  ])
    expect(css, token).toContain(token)
  // a fence like `:not([data-scope=field] *)` keeps another component's rule off a field; it styles no field
  expect(unfenced(css)).not.toContain('[data-scope=field]')
}, 60000)

test('a button brings no grid, palette or editor', async () => {
  const { js, css } = await bundle('<Button>Save</Button>', 'Button')
  for (const word of [
    'treegrid',
    'aria-activedescendant',
    'contenteditable',
    'veneer-code-',
    'Unexpected end',
  ])
    expect(js, word).not.toContain(word)
  for (const word of ['data-scope="rte"', 'code-in', 'data-scope="kv"', 'data-scope="pagination"'])
    expect(css, word).not.toContain(word)
}, 60000)

test('the palette brings no editor, and pagination no grid', async () => {
  const palette = await bundle('<CommandPalette commands={[]} />', 'CommandPalette')
  for (const word of ['contenteditable', 'treegrid', 'veneer-code-'])
    expect(palette.js, word).not.toContain(word)
  const pages = await bundle('<PaginationBar total={10} size={5} />', 'PaginationBar')
  for (const word of ['treegrid', 'contenteditable']) expect(pages.js, word).not.toContain(word)
}, 60000)
