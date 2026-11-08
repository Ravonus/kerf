// Exercise the Button's themed host and moving fill against real pointer states.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'

const require = createRequire(
  process.env.WEFT_PLAYWRIGHT_PACKAGE ?? new URL('../../warp/package.json', import.meta.url),
)
const { chromium } = require('playwright-core')
const styles = new URL('../styles/', import.meta.url)
const css = (path) => readFileSync(new URL(path, styles), 'utf8')
let browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

async function sample(themed, configured) {
  const page = await browser.newPage()
  try {
    const values = configured
      ? `--warp-button-bg:rgb(10,20,30);--warp-button-text:rgb(20,30,40);
      --warp-button-bg-hover:rgb(200,0,0);--warp-button-text-hover:rgb(201,0,0);
      --warp-button-bg-focus:rgb(0,180,0);--warp-button-text-focus:rgb(0,181,0);
      --warp-button-bg-press:rgb(0,0,200);--warp-button-text-press:rgb(0,0,201);
      --warp-button-bg-disabled:rgb(80,80,80);--warp-button-text-disabled:rgb(90,90,90);`
      : ''
    await page.setContent(`<style>${css('warp.css')}\n${css(themed ? 'themed/components/button.css' : 'components/button.css')}
 button, button::before { transition: none !important }</style>
      <button id="before">Before</button><button data-scope="button" data-follow style="--_a:1;${values}">Go</button>`)
    const button = page.locator('[data-scope=button]')
    const paint = () =>
      button.evaluate((el) => {
        const host = getComputedStyle(el),
          layer = getComputedStyle(el, '::before')
        return {
          background: host.backgroundColor,
          text: host.color,
          layer: layer.backgroundColor,
          image: layer.backgroundImage,
        }
      })
    const resting = await paint()
    await button.hover()
    const hover = await paint()
    await page.mouse.down()
    const press = await paint()
    await page.mouse.up()
    await page.mouse.move(500, 500)
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    const focus = await paint()
    await button.evaluate((el) => {
      el.disabled = true
    })
    const disabled = await paint()
    return { resting, hover, press, focus, disabled }
  } finally {
    await page.close()
  }
}

void test('Button state colors reach host and moving fill without changing defaults', async () => {
  assert.deepEqual(await sample(true, false), await sample(false, false))
  const result = await sample(true, true)
  for (const [state, rgb] of Object.entries({
    resting: '10, 20, 30',
    hover: '200, 0, 0',
    press: '0, 0, 200',
    focus: '0, 180, 0',
    disabled: '80, 80, 80',
  })) {
    assert.equal(result[state].background, `rgb(${rgb})`, state)
    if (state !== 'resting') assert.ok(result[state].image.includes(rgb), `${state} gradient`)
  }
  for (const [state, rgb] of Object.entries({
    resting: '20, 30, 40',
    hover: '201, 0, 0',
    press: '0, 0, 201',
    focus: '0, 181, 0',
    disabled: '90, 90, 90',
  })) {
    assert.equal(result[state].text, `rgb(${rgb})`, state)
  }
})
