// Compare selective imports with the complete public sheet, including pseudo-elements.
// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const read = (name: string) =>
  readFileSync(new URL(`../../veneer-core/styles/${name}.css`, import.meta.url), 'utf8')
const base = ['veneer', 'components/base', 'inputs/base', 'inputs/field', 'inputs/keyframes']
  .map(read)
  .join('\n')
const borders = '<span data-part="sweep-base"></span><span data-part="sweep"></span>'
const fixtures = {
  checkbox: `<label data-scope="checkbox"><input type="checkbox"><span data-part="control" data-sweep><span data-part="mark"></span></span><span data-part="label">Choice</span><span data-part="hint">Hint</span></label>`,
  radio: `<label data-scope="radio"><input type="radio"><span data-part="control" data-sweep>${borders}</span><span data-part="label">Choice</span><span data-part="hint">Hint</span></label>`,
  switch: `<label data-scope="switch" data-placement="end"><input type="checkbox" role="switch"><span data-part="track" data-sweep><span data-part="rail-fill"><span data-part="rail-hover"></span></span>${borders}<span data-part="thumb"></span></span><span data-part="label">Choice</span><span data-part="hint">Hint</span></label>`,
  segmented: `<div data-scope="segmented"><span data-part="indicator" data-instant></span><label data-sweep>${borders}<input type="radio" name="segment"><span data-part="item">One<span data-part="count">2</span></span></label><label data-sweep>${borders}<input type="radio" name="segment"><span data-part="item">Two</span></label></div>`,
  select: `<div data-scope="field" data-variant="classic" data-compact><div data-part="control" data-sweep>${borders}<button data-part="input" aria-expanded="false"><span data-part="value" data-placeholder="Choose"></span></button><select data-part="carrier"><option>One</option></select><span data-part="indicator"><svg></svg></span></div></div><div data-scope="select"><input data-part="search"><div data-part="list"><div role="option" aria-selected="true"><span data-part="item-check">x</span>One</div></div></div>`,
}
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())
vi.setConfig({ testTimeout: 120_000 })

test('every selective sheet has a positive and negative appearance fixture', () => {
  const sheets = readdirSync(new URL('../../veneer-core/styles/inputs/', import.meta.url))
    .filter((name) => name.startsWith('choice-'))
    .sort()
  expect(sheets).toEqual(
    Object.keys(fixtures)
      .map((name) => `choice-${name}.css`)
      .sort(),
  )
})

const sameAppearance = (page: Playwright.Page, before: string, after: string) =>
  page.evaluate(
    (sheets) => {
      const sheet = document.querySelector('#choice')!
      const footprint = () =>
        JSON.stringify(
          [...document.querySelectorAll('#fixture, #fixture *')].flatMap((node) =>
            ['', '::before', '::after'].map((pseudo) => {
              const style = getComputedStyle(node, pseudo || null)
              return [...style].sort().map((key) => [key, style.getPropertyValue(key)])
            }),
          ),
        )
      sheet.textContent = sheets.before
      const original = footprint()
      sheet.textContent = sheets.after
      return original === footprint()
    },
    { before, after },
  )

test.each(Object.entries(fixtures))(
  '%s selective CSS retains computed appearance',
  async (name, html) => {
    const page = await browser.newPage()
    try {
      await page.setContent(
        `<style>${base}</style><style id="choice"></style><style>*,*::before,*::after{animation:none!important;transition:none!important}</style><div id="fixture">${html}</div>`,
      )
      for (const [theme, expression, density] of [
        ['light', 'balanced', 'cozy'],
        ['dark', 'vivid', 'compact'],
        ['light', 'quiet', 'comfortable'],
      ])
        for (const direction of ['ltr', 'rtl'])
          for (const width of [400, 1280]) {
            await page.setViewportSize({ width, height: 800 })
            await page.evaluate((attrs) => Object.assign(document.documentElement.dataset, attrs), {
              theme,
              expression,
              density,
            })
            await page.evaluate((dir) => (document.documentElement.dir = dir), direction)
            for (const state of [
              'rest',
              'checked',
              'indeterminate',
              'invalid',
              'disabled',
              'focus',
              'hover',
            ]) {
              await setState(page, state)
              expect(
                await sameAppearance(page, read('inputs/choice'), read(`inputs/choice-${name}`)),
                `${theme}/${expression}/${direction}/${width}/${state}`,
              ).toBe(true)
            }
          }
      for (const forcedColors of ['none', 'active'] as const) {
        await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' })
        expect(
          await sameAppearance(page, read('inputs/choice'), read(`inputs/choice-${name}`)),
          `forced colors: ${forcedColors}`,
        ).toBe(true)
      }
      expect(
        await sameAppearance(page, '', read(`inputs/choice-${name}`)),
        'missing-sheet negative must change appearance',
      ).toBe(false)
    } finally {
      await page.close()
    }
  },
)

async function setState(page: Playwright.Page, state: string) {
  await page.mouse.move(0, 0)
  await page.evaluate((next) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    for (const host of document.querySelectorAll<HTMLElement>('#fixture [data-scope]'))
      host.toggleAttribute('data-invalid', next === 'invalid')
    for (const input of document.querySelectorAll<HTMLInputElement>('#fixture input')) {
      input.checked = next === 'checked'
      input.indeterminate = next === 'indeterminate'
      input.disabled = next === 'disabled'
    }
  }, state)
  if (state === 'focus') await page.locator('#fixture input, #fixture button').first().focus()
  if (state === 'hover') await page.locator('#fixture [data-scope]').first().hover()
}
