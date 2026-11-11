// @vitest-environment node
// Composing veneer parts can't break them: an input inside a Modal, a Card, a Popover, an Alert, a table cell or an
// assistant answer renders exactly as it does on its own. A checkbox in a Modal once took the dialog's 36px mark and
// the flows sheet's 44px result mark for its tick (a bare `[data-part="mark"]`), so a checked box showed a tile
// outside the box. Each input is measured once with only the sheets its component imports, then inside every host with
// every shipped sheet loaded, so a rule from any component that reaches into another shows here.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'
import { classicCss } from '../plugin.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const styles = new URL('../../veneer-core/styles/', import.meta.url)
const files = readdirSync(styles, { recursive: true, encoding: 'utf8' }).filter((f) =>
  f.endsWith('.css'),
)
const rank = (f: string) =>
  f === 'veneer.css' ? 0 : f.endsWith('/tokens.css') ? 1 : f.endsWith('/base.css') ? 2 : 3
const read = (f: string) => readFileSync(new URL(f, styles), 'utf8')
const every = files
  .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))
  .map(read)
  .join('\n')
// what Choice, Field and their bases import (packages/veneer/src/styles.ts, Choice-*.tsx, Field.tsx)
const own = [
  'veneer.css',
  'components/base.css',
  'inputs/base.css',
  'inputs/field.css',
  'inputs/keyframes.css',
  'inputs/choice-checkbox.css',
  'inputs/choice-radio.css',
  'inputs/choice-switch.css',
  'inputs/choice-segmented.css',
  'inputs/text-field.css',
]
  .map(read)
  .join('\n')

const sweep = '<span data-part="sweep-base"></span><span data-part="sweep"></span>'
const label = (text: string) =>
  `<label data-part="label" for="i-${text}"><span data-part="label-text">${text}</span></label>`
const INPUTS = {
  checkbox: `<label data-scope="checkbox"><input type="checkbox" checked><span data-part="control" data-sweep><span data-part="mark"></span></span><span data-part="label">Agree</span></label>`,
  radio: `<label data-scope="radio"><input type="radio" checked><span data-part="control" data-sweep>${sweep}</span><span data-part="label">One</span></label>`,
  switch: `<label data-scope="switch"><input type="checkbox" role="switch" checked><span data-part="track" data-sweep><span data-part="rail-fill"><span data-part="rail-hover"></span></span>${sweep}<span data-part="thumb"></span></span><span data-part="label">Wi-Fi</span></label>`,
  text: `<div data-scope="field"><div data-part="control" data-sweep>${sweep}${label('Name')}<input data-part="input" id="i-Name" placeholder=" "></div></div>`,
  textarea: `<div data-scope="field"><div data-part="control" data-sweep>${sweep}${label('Note')}<textarea data-part="input" id="i-Note" rows="3" placeholder=" "></textarea></div></div>`,
  segmented: `<div data-scope="segmented" role="radiogroup" aria-label="View"><span data-part="indicator"></span><label data-sweep><span data-part="sweep"></span><input type="radio" name="v" checked><span data-part="item">A</span></label><label data-sweep><span data-part="sweep"></span><input type="radio" name="v"><span data-part="item">B</span></label></div>`,
}
// a fixed width, and the text metrics a host may set (an answer's prose leading) put back, so only rules differ
const box = (inner: string) =>
  `<div class="box" style="inline-size:320px;font-size:16px;line-height:1.5">${inner}</div>`
const HOSTS: Record<string, (x: string) => string> = {
  page: (x) => x,
  modal: (x) =>
    `<dialog data-scope="dialog" open data-presentation="inline"><div data-part="header"><span data-part="mark"></span><h2 data-part="title">Title</h2></div><div data-part="body">${x}</div><div data-part="footer"></div></dialog>`,
  card: (x) =>
    `<div data-scope="surface"><span data-part="eyebrow">Eyebrow</span><span data-part="title">Card</span><div data-part="content">${x}</div></div>`,
  popover: (x) => `<div data-scope="popover"><div data-part="content">${x}</div></div>`,
  alert: (x) => `<div data-scope="alert"><div data-part="content">${x}</div></div>`,
  table: (x) =>
    `<table data-scope="table"><tbody><tr><td data-part="cell">${x}</td></tr></tbody></table>`,
  answer: (x) =>
    `<article data-scope="assistant"><span data-part="mark"></span><div data-part="content">${x}</div></article>`,
  'card in modal': (x) => HOSTS.modal!(HOSTS.card!(x)),
  'modal in card': (x) => HOSTS.card!(HOSTS.modal!(x)),
}
// what a host may change: inherited text (an alert's tone colour) is the host's to set; the box and its paint are not
const PROPS = [
  'display',
  'position',
  'inline-size',
  'block-size',
  'inset-block-start',
  'inset-inline-start',
  'margin-block-start',
  'margin-inline-start',
  'padding-block-start',
  'padding-inline-start',
  'border-block-start-width',
  'border-start-start-radius',
  'background-color',
  'background-image',
  'box-shadow',
  'clip-path',
  'mask-image',
  'opacity',
  'transform',
  'grid-template-columns',
]

// a host that names the component on purpose: a table's row checkboxes carry a hairline (veneer-data.css)
const ALLOWED = ['checkbox in table: span[control] box-shadow']

let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())
vi.setConfig({ testTimeout: 60_000 })

const page = (css: string, sections: string, root = 'data-fields="classic"') =>
  `<!doctype html><html data-expression="vivid" ${root}><style>${css}</style><style>*,*::before,*::after{animation:none!important;transition:none!important}</style><body>${sections}</body></html>`

/** Each section's input, as [element label, ...PROPS values] rows, keyed by `input in host`. */
async function measure(html: string) {
  const p = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await p.setContent(html)
  const out = await p.evaluate((props) => {
    const rows: Record<string, string[][]> = {}
    for (const section of document.querySelectorAll('section')) {
      const root = section.querySelector('.box > *')!
      rows[`${section.dataset.input} in ${section.dataset.host}`] = [
        root,
        ...root.querySelectorAll('*'),
      ].flatMap((el) =>
        ['', '::before', '::after'].map((pseudo) => {
          const s = getComputedStyle(el, pseudo || null)
          const part = (el as HTMLElement).dataset.part
          return [
            `${el.tagName.toLowerCase()}${part ? `[${part}]` : ''}${pseudo}`,
            ...props.map((name) => s.getPropertyValue(name)),
          ]
        }),
      )
    }
    return rows
  }, PROPS)
  await p.close()
  return out
}

const sections = (hosts: string[]) =>
  Object.entries(INPUTS)
    .flatMap(([name, html]) =>
      hosts.map(
        (host) =>
          `<section data-input="${name}" data-host="${host}">${HOSTS[host]!(box(html.replaceAll('name="v"', `name="v-${host}"`)))}</section>`,
      ),
    )
    .join('')

test('every input renders the same inside every host, with every sheet loaded, as with only its own', async () => {
  const alone = await measure(page(own, sections(['page'])))
  const composed = await measure(page(every, sections(Object.keys(HOSTS))))
  const diffs: string[] = []
  for (const [key, rows] of Object.entries(composed)) {
    const want = alone[`${key.split(' in ')[0]} in page`]!
    rows.forEach((row, i) =>
      row.slice(1).forEach((v, j) => {
        if (v !== want[i]![j + 1])
          diffs.push(`${key}: ${row[0]} ${PROPS[j]} ${want[i]![j + 1]} -> ${v}`)
      }),
    )
  }
  expect(diffs.filter((d) => !ALLOWED.some((a) => d.startsWith(a)))).toEqual([])
})

// veneer({ fields: 'classic' }) makes classic the default with no attribute on the page, by copying every rule keyed on
// [data-fields="classic"] to :root:not([data-fields="floating"]). A rule that names classic only inside :not() can't be
// copied that way, so a Textarea's label sat on its top border as a floating label: the default must render exactly
// what data-fields="classic" does.
test('the plugin\'s classic default renders every field as data-fields="classic" does', async () => {
  const fields = Object.fromEntries(
    Object.entries(INPUTS).filter(([name]) => name === 'text' || name === 'textarea'),
  )
  const html = Object.entries(fields)
    .map(([name, x]) => `<section data-input="${name}" data-host="page">${box(x)}</section>`)
    .join('')
  const attr = await measure(page(own, html))
  const plugin = await measure(page(own + classicCss(), html, ''))
  expect(plugin).toEqual(attr)
})
