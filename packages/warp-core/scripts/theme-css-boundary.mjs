// Inspect Button sweep boundaries without inferring contrast from a host pair.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'

const require = createRequire(
  process.env.WEFT_PLAYWRIGHT_PACKAGE ?? new URL('../../warp/package.json', import.meta.url),
)
const { chromium } = require('playwright-core')
const styles = new URL('../styles/', import.meta.url)
const read = (path) =>
  readFileSync(
    path === 'themed/components/button.css' && process.env.WEFT_BUTTON_CSS
      ? process.env.WEFT_BUTTON_CSS
      : new URL(path, styles),
    'utf8',
  )
let browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

async function render(
  page,
  { mode, expression, emphasis, tone, bg, ink, overrides = '', themed = true },
) {
  await page.setContent(`<html data-theme="${mode}" data-expression="${expression}"><style>
    ${read(themed ? 'themed/warp.css' : 'warp.css')}
    ${read(themed ? 'themed/components/button.css' : 'components/button.css')}
    * {transition:none!important;animation:none!important} body {background:white}</style>
    <div id="button" data-scope="button" data-sweep data-emphasis="${emphasis}" data-tone="${tone}"
    style="${bg ? `--warp-button-bg:${bg};--warp-button-text:${ink};` : ''}${overrides}">
      <i data-part="sweep-base"></i><i data-part="sweep"></i><i data-part="frame-corners"></i>
      <i data-part="sweep-corners"></i><span data-part="sweep-outline"><i></i></span></div></html>`)
  return page.locator('#button').evaluate((el) => {
    const color = (part) => getComputedStyle(el.querySelector(`[data-part="${part}"]`)).color
    return {
      bg: getComputedStyle(el).backgroundColor,
      base: color('sweep-base'),
      stroke: color('sweep'),
      track: color('frame-corners'),
      corners: color('sweep-corners'),
      segment: getComputedStyle(el.querySelector('[data-part="sweep-outline"] > i'))
        .backgroundColor,
      ambient: getComputedStyle(document.body).backgroundColor,
    }
  })
}

function contrast(first, second) {
  const luminance = (color) => {
    const values = color.match(/\d+/g).map(Number).slice(0, 3)
    const linear = values.map((value) => {
      const c = value / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

void test('frame and soft boundaries respect Button inputs and explicit sweep overrides', async () => {
  const page = await browser.newPage()
  try {
    for (const mode of ['light', 'dark'])
      for (const expression of ['quiet', 'balanced', 'vivid']) {
        for (const emphasis of ['frame', 'soft'])
          for (const tone of ['positive', 'caution', 'critical', 'info']) {
            const common = { mode, expression, emphasis, tone }
            assert.deepEqual(
              await render(page, { ...common, themed: true }),
              await render(page, { ...common, themed: false }),
            )
            for (const [bg, ink] of [
              ['black', 'white'],
              ['white', 'black'],
            ]) {
              const paint = await render(page, { ...common, bg, ink })
              const expectedBg = bg === 'black' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
              const expectedInk = ink === 'black' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
              assert.equal(paint.bg, expectedBg)
              for (const key of ['stroke', 'corners', 'segment'])
                assert.equal(
                  paint[key],
                  expectedInk,
                  `${mode}/${expression}/${emphasis}/${tone}/${key}`,
                )
              assert.equal(paint.base, expectedBg)
              assert.equal(paint.track, expectedBg)
              assert.ok(contrast(paint.stroke, paint.base) >= 3)
              assert.equal(contrast(paint.stroke, paint.base), 21)
              const explicit = await render(page, {
                ...common,
                bg,
                ink,
                overrides: '--warp-sweep-base:green;--warp-sweep-stroke:blue',
              })
              assert.equal(explicit.base, 'rgb(0, 128, 0)')
              assert.equal(explicit.track, 'rgb(0, 128, 0)')
              for (const key of ['stroke', 'corners', 'segment'])
                assert.equal(explicit[key], 'rgb(0, 0, 255)')
              assert.equal(paint.ambient, 'rgb(255, 255, 255)')
            }
          }
      }
  } finally {
    await page.close()
  }
})

void test('nested buttons do not inherit a parent private state boundary', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${read('themed/warp.css')}\n${read('themed/components/button.css')}</style>
      <div data-scope="button" data-sweep data-press style="--warp-button-text-press:white;--warp-button-bg-press:black">
        <i data-part="sweep-base"></i><i data-part="sweep"></i><div data-scope="button" data-sweep data-press style="--warp-button-text-press:black;--warp-button-bg-press:white">
        <i data-part="sweep-base"></i><i data-part="sweep"></i></div></div>`)
    const colors = await page
      .locator('[data-part=sweep]')
      .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el).color))
    assert.deepEqual(colors, ['rgb(255, 255, 255)', 'rgb(0, 0, 0)'])
    const bases = await page
      .locator('[data-part=sweep-base]')
      .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el).color))
    assert.deepEqual(bases, ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'])
  } finally {
    await page.close()
  }
})

void test('invalid sweep retains the critical paint', async () => {
  const page = await browser.newPage()
  try {
    const paint = async (themed, configured) => {
      await page.setContent(`<style>${read(themed ? 'themed/warp.css' : 'warp.css')}\n${read(themed ? 'themed/components/button.css' : 'components/button.css')}</style>
        <div data-scope="button" data-sweep data-invalid style="${configured ? '--warp-button-text:white' : ''}"><i data-part="sweep"></i></div>`)
      return page.locator('[data-part=sweep]').evaluate((el) => getComputedStyle(el).color)
    }
    const legacy = await paint(false, false)
    assert.equal(await paint(true, false), legacy)
    assert.equal(await paint(true, true), legacy)
  } finally {
    await page.close()
  }
})
