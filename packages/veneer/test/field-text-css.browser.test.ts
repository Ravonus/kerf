// @vitest-environment node
// Compare the field import with the complete public text sheet on real controls.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const read = (name: string) =>
  readFileSync(new URL(`../../veneer-core/styles/${name}.css`, import.meta.url), 'utf8')
const base = ['veneer', 'components/base', 'inputs/base', 'inputs/field', 'inputs/keyframes']
  .map(read)
  .join('\n')
const full = read('inputs/text')
const selective = read('inputs/text-field')
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())
vi.setConfig({ testTimeout: 120_000 })

async function sameAppearance(page: Playwright.Page, after: string) {
  return page.evaluate(
    (sheets) => {
      const sheet = document.querySelector('#text')!
      const footprint = () =>
        JSON.stringify(
          [...document.querySelectorAll('#fixture, #fixture *')].flatMap((node) =>
            ['', '::before', '::after'].map((pseudo) => {
              const style = getComputedStyle(node, pseudo || null)
              return [...style].sort().map((key) => [key, style.getPropertyValue(key)])
            }),
          ),
        )
      sheet.textContent = sheets.full
      const before = footprint()
      sheet.textContent = sheets.after
      return before === footprint()
    },
    { full, after },
  )
}

const controls = {
  input: '<input data-part="input" placeholder=" " value="Value">',
  search: '<input data-part="input" type="search" placeholder=" " value="Value">',
  textarea: '<textarea data-part="input" rows="3">Value</textarea>',
  select: '<button data-part="input" role="combobox" aria-expanded="false">Value</button>',
}

test.each(Object.entries(controls))('%s retains full-sheet appearance', async (_name, control) => {
  const page = await browser.newPage({ hasTouch: true })
  try {
    await page.setContent(
      `<style>${base}</style><style id="text"></style><style>*,*::before,*::after{animation-play-state:paused!important;transition:none!important}</style><div id="fixture" data-scope="field"><div data-part="control" data-sweep><span data-part="sweep-base"></span><span data-part="sweep"></span><label data-part="label">Label</label>${control}<button data-part="action">Action</button><button data-part="clear">Clear</button></div><div data-part="message">Hint</div></div>`,
    )
    for (const [theme, expression, density] of [
      ['light', 'balanced', 'cozy'],
      ['dark', 'vivid', 'compact'],
      ['light', 'quiet', 'comfortable'],
    ])
      for (const direction of ['ltr', 'rtl'])
        for (const width of [400, 1280])
          for (const pointer of ['fine', 'coarse']) {
            await page.setViewportSize({ width, height: 800 })
            await page.evaluate((attrs) => Object.assign(document.documentElement.dataset, attrs), {
              theme,
              expression,
              density,
              pointer,
            })
            await page.evaluate((dir) => (document.documentElement.dir = dir), direction)
            for (const state of [
              'rest',
              'classic',
              'invalid',
              'disabled',
              'readonly',
              'focus',
              'hover',
            ]) {
              await setState(page, state)
              expect(
                await sameAppearance(page, selective),
                `${theme}/${expression}/${density}/${direction}/${width}/${pointer}/${state}`,
              ).toBe(true)
            }
          }
    await page.evaluate(() => delete document.documentElement.dataset.pointer)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    expect(await sameAppearance(page, selective), 'native coarse pointer').toBe(true)
    for (const forcedColors of ['none', 'active'] as const) {
      await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' })
      expect(await sameAppearance(page, selective), forcedColors).toBe(true)
    }
    expect(await sameAppearance(page, ''), 'missing sheet must change appearance').toBe(false)
  } finally {
    await page.close()
  }
})

async function setState(page: Playwright.Page, state: string) {
  await page.mouse.move(0, 0)
  await page.evaluate((next) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const field = document.querySelector<HTMLElement>('#fixture')!
    field.toggleAttribute('data-invalid', next === 'invalid')
    field.dataset.variant = next === 'classic' ? 'classic' : 'floating'
    for (const input of field.querySelectorAll<HTMLInputElement>('input,textarea,button')) {
      input.disabled = next === 'disabled'
      input.readOnly = next === 'readonly'
    }
  }, state)
  if (state === 'focus') await page.locator('[data-part="input"]').focus()
  if (state === 'hover') await page.locator('[data-part="control"]').hover()
}
