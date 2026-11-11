// @vitest-environment node
// Surfaces opt in to the sweep (SIGNATURE §3), in Chrome from veneer's real stylesheets: cards, panels, list rows, tiles,
// stat rows and clickable cards never sweep by default, at any expression. The kit marks them data-sweep="surface",
// which only data-flair="sweep" lights; any other data-sweep (Card's `sweep` prop) sweeps at every stop.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const styles = (f: string) =>
  readFileSync(new URL(`../../veneer-core/styles/${f}`, import.meta.url), 'utf8')
const css =
  [
    'veneer.css',
    'components/base.css',
    'components/surface.css',
    'data/tokens.css',
    'data/base.css',
    'data/card.css',
    'data/panel.css',
    'data/stat.css',
    'data/stat-row.css',
    'data/kanban.css',
    'app/tokens.css',
    'app/base.css',
    'app/notification.css',
  ]
    .map(styles)
    .join('\n') +
  readFileSync(
    new URL('../../../docs/design/veneer/tokens/veneer-marketing.css', import.meta.url),
    'utf8',
  )

const part = '<span data-part="sweep"></span>'
// [id, markup with SWEEP where the data-sweep attribute goes]
const SURFACES: [string, string][] = [
  ['card', '<div data-scope="surface" SWEEP>Card</div>'],
  ['link-card', '<a href="#x" data-scope="surface" SWEEP>Link card</a>'],
  ['button-card', '<button type="button" data-scope="surface" SWEEP>Button card</button>'],
  ['panel', '<section data-scope="panel" SWEEP>Panel</section>'],
  ['stat', '<div data-scope="stat" data-interactive SWEEP>Stat</div>'],
  ['stat-row', '<div data-scope="stat-row" data-variant="inline" SWEEP><dl></dl></div>'],
  ['data-card', '<div data-scope="card" SWEEP>Card</div>'],
  ['kanban', '<div data-scope="kanban"><div data-part="card" SWEEP>Task</div></div>'],
  ['row', '<article data-scope="notification" SWEEP>Row</article>'],
  ['tile', '<div data-scope="tile" SWEEP>Tile</div>'],
]
const host = (id: string, value: string) =>
  SURFACES.find((s) => s[0] === id)![1]
    .replace('SWEEP', `id="${id}-${value || 'on'}" data-sweep="${value}"`)
    .replace(/<\/(\w+)>$/, `${part}</$1>`)
const PAGE = SURFACES.map(([id]) => host(id, 'surface') + host(id, '')).join('\n')

let browser: Playwright.Browser
let page: Playwright.Page
beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await page.setContent(
    `<!doctype html><html data-expression="balanced"><style>${css}</style><body>${PAGE}<button id="btn" data-scope="button" data-emphasis="outline" data-sweep>${part}Go</button>`,
  )
})
afterAll(async () => {
  await browser?.close()
})

const gates = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-sweep]')].map((n) => [
        n.id,
        getComputedStyle(n).getPropertyValue('--_on').trim(),
      ]),
    ),
  )
const dial = (expression: string, flair?: string) =>
  page.evaluate(
    ([e, f]) => {
      document.documentElement.dataset.expression = e
      f
        ? (document.documentElement.dataset.flair = f)
        : delete document.documentElement.dataset.flair
    },
    [expression, flair],
  )

for (const expression of ['quiet', 'balanced', 'vivid']) {
  test(`${expression}: no surface sweeps by default, clickable or not; one that opts in does`, async () => {
    await dial(expression)
    const on = await gates()
    for (const [id] of SURFACES) {
      expect([id, on[`${id}-surface`]]).toEqual([id, '0'])
      expect([id, on[`${id}-on`]]).toEqual([id, '1'])
    }
    expect(on.btn).toBe('1') // buttons are untouched
  })
}

test('data-flair="sweep" still lights the surfaces the kit marks', async () => {
  await dial('balanced', 'sweep')
  const on = await gates()
  for (const [id] of SURFACES) expect([id, on[`${id}-surface`]]).toEqual([id, '1'])
  await dial('balanced', 'none')
  const off = await gates()
  for (const [id] of SURFACES) expect([id, off[`${id}-surface`]]).toEqual([id, '0'])
  await dial('balanced')
})

test('a hovered clickable card draws no stroke unless it opted in', async () => {
  await dial('vivid')
  const shows = async (id: string) => {
    await page.hover(`#${id}`)
    const s = page.locator(`#${id} > [data-part="sweep"]`)
    await s.evaluate((n) =>
      Promise.all(
        n.getAnimations().map((a) => {
          a.finish()
          return a.finished
        }),
      ),
    )
    return s.evaluate((n) => getComputedStyle(n).opacity)
  }
  expect(await shows('link-card-surface')).toBe('0')
  expect(await shows('link-card-on')).toBe('1')
  await dial('balanced')
})
