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
const css = (path) =>
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

void test('overlapping states fall through and nested buttons isolate private state', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${css('warp.css')}\n${css('themed/components/button.css')}
      [data-scope=button], [data-scope=button]::before { transition:none!important }
      #outer {width:200px;height:100px} #inner {width:60px;height:30px}</style>
      <button id="before">Before</button><div id="outer" tabindex="0" data-scope="button"
       style="--warp-button-bg:rgb(10,20,30);--warp-button-text:rgb(20,30,40);
       --warp-button-bg-hover:rgb(200,0,0);--warp-button-text-hover:rgb(201,0,0)">
       <div id="inner" data-scope="button" style="--warp-button-bg:rgb(0,0,200);--warp-button-text:rgb(0,0,201)">Inner</div></div>`)
    const outer = page.locator('#outer'),
      inner = page.locator('#inner')
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    const box = await outer.boundingBox()
    await page.mouse.move(box.x + 5, box.y + 5)
    const read = (el) =>
      el.evaluate((node) => ({
        bg: getComputedStyle(node).backgroundColor,
        text: getComputedStyle(node).color,
        image: getComputedStyle(node, '::before').backgroundImage,
      }))
    const overlap = await read(outer)
    assert.equal(overlap.bg, 'rgb(200, 0, 0)')
    assert.equal(overlap.text, 'rgb(201, 0, 0)')
    assert.ok(overlap.image.includes('200, 0, 0'))
    await page.mouse.down()
    const pressed = await read(outer)
    assert.equal(pressed.bg, 'rgb(200, 0, 0)')
    assert.equal(pressed.text, 'rgb(201, 0, 0)')
    assert.ok(pressed.image.includes('200, 0, 0'))
    const nested = await read(inner)
    assert.equal(nested.bg, 'rgb(0, 0, 200)')
    assert.equal(nested.text, 'rgb(0, 0, 201)')
    assert.ok(nested.image.includes('0, 0, 200'))
    await page.mouse.up()
  } finally {
    await page.close()
  }
})

void test('nested Button does not inherit its parent moving fill state', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${css('warp.css')}\n${css('themed/components/button.css')}
      #outer {width:200px;height:100px} #inner {width:60px;height:30px}</style>
      <div id="outer" data-scope="button" style="--warp-button-bg-hover:rgb(200,0,0)">
      <div id="inner" data-scope="button" style="--warp-button-bg:rgb(0,0,200)">Inner</div></div>`)
    const outer = page.locator('#outer'),
      inner = page.locator('#inner')
    const box = await outer.boundingBox()
    await page.mouse.move(box.x + 5, box.y + 5)
    const image = await inner.evaluate((el) => getComputedStyle(el, '::before').backgroundImage)
    assert.ok(image.includes('0, 0, 200'))
    assert.ok(!image.includes('200, 0, 0'))
  } finally {
    await page.close()
  }
})
