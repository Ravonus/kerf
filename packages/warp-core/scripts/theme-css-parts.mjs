// Exercise the generated non-colour part readers and their local boundaries.
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
    path === 'themed/data/card.css' && process.env.WEFT_CARD_CSS
      ? process.env.WEFT_CARD_CSS
      : new URL(path, styles),
    'utf8',
  )
const sheets = [
  'warp.css',
  'components/button.css',
  'components/nav.css',
  'components/tabs.css',
  'components/link.css',
  'components/pill.css',
  'data/card.css',
]
let browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

async function render(themed, content, extra = '') {
  const page = await browser.newPage()
  const css = sheets.map((path) => read(themed ? `themed/${path}` : path)).join('\n')
  await page.setContent(`<style>${css}\n${extra}</style>${content}`)
  return page
}

void test('default part styles match the legacy sheets', async () => {
  const content = `<div data-scope="button">Button</div>
    <nav data-scope="nav" data-axis="x"><a aria-current="page">Nav</a></nav>
    <div data-scope="tabs" data-part="root"><div data-part="list"><div data-part="indicator"></div></div></div>
    <a href="#" data-scope="link">Link</a><span data-scope="pill">Pill</span>
    <div data-scope="field"><div data-part="control">Field</div></div>
    <div data-scope="card">Card</div>`
  const sample = async (themed) => {
    const page = await render(
      themed,
      content,
      '* { transition: none !important; animation: none !important }',
    )
    try {
      return await page
        .locator('[data-scope], [data-part="control"], [data-part="indicator"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const s = getComputedStyle(node)
            return [
              s.gap,
              s.padding,
              s.borderRadius,
              s.boxShadow,
              s.font,
              s.width,
              s.height,
              s.textDecorationThickness,
              s.textUnderlineOffset,
              s.color,
              s.backgroundColor,
            ]
          }),
        )
    } finally {
      await page.close()
    }
  }
  assert.deepEqual(await sample(true), await sample(false))
})

void test('part inputs reach hosts, descendants and active states without leaking', async () => {
  const page = await render(
    true,
    `
    <div id="button" data-scope="button" style="--warp-button-shadow:0 0 2px red;
      --warp-button-shadow-hover:0 0 3px blue;--warp-button-shadow-press:0 0 4px green;
      --warp-button-scale-press:.8;--warp-button-duration:123ms">Button</div>
    <nav id="nav" data-scope="nav" data-axis="x" style="--warp-nav-gap:19px;--warp-nav-underline-width:7px">
      <a aria-current="page">Nav</a><i data-part="indicator"></i></nav>
    <div id="tabs" data-scope="tabs" data-part="root" style="--warp-tabs-gap:21px;--warp-tabs-underline-width:8px">
      <div data-part="list"><i data-part="indicator"></i></div></div>
    <a id="link" href="#" data-scope="link" style="--warp-link-underline-width:4px;--warp-link-underline-offset:5px">Link</a>
    <span id="pill" data-scope="pill" style="--warp-pill-gap:17px;--warp-pill-gap-hover:23px;
      --warp-pill-gap-active:29px;--warp-pill-height:42px;--warp-pill-radius:13px;--warp-pill-font-size:19px">
      Pill <span id="nested" data-scope="pill">Nested</span></span><span id="sibling" data-scope="pill">Sibling</span>
    <div id="field" data-scope="field" style="--warp-field-gap:11px;--warp-field-radius:14px"><div data-part="control">Field</div></div>
    <div id="card" data-scope="card" style="--warp-card-gap:16px;--warp-card-padding:18px;
      --warp-card-radius:12px;--warp-card-shadow:0 0 5px red;--warp-card-shadow-hover:0 0 6px blue">Card</div>
  `,
  )
  try {
    const button = page.locator('#button')
    const get = (selector, property) =>
      page.locator(selector).evaluate((el, key) => getComputedStyle(el)[key], property)
    assert.ok((await get('#button', 'transitionDuration')).includes('0.123s'))
    await page.addStyleTag({
      content: '* { transition: none !important; animation: none !important }',
    })
    assert.match(await get('#button', 'boxShadow'), /rgb\(255, 0, 0\).*2px/)
    await button.hover()
    assert.match(await get('#button', 'boxShadow'), /rgb\(0, 0, 255\).*3px/)
    await button.evaluate((el) => el.setAttribute('data-press', ''))
    assert.match(await get('#button', 'boxShadow'), /rgb\(0, 128, 0\).*4px/)
    assert.equal(await get('#button', 'scale'), '0.8')
    assert.equal(await get('#nav', 'gap'), '19px')
    assert.equal(
      await page.locator('#nav a').evaluate((el) => getComputedStyle(el, '::after').blockSize),
      '7px',
    )
    assert.equal(await get('#nav [data-part="indicator"]', 'blockSize'), '7px')
    assert.equal(await get('#tabs', 'gap'), '21px')
    assert.equal(await get('#tabs [data-part="indicator"]', 'blockSize'), '8px')
    assert.equal(await get('#link', 'textDecorationThickness'), '4px')
    assert.equal(await get('#link', 'textUnderlineOffset'), '5px')
    assert.equal(await get('#pill', 'gap'), '17px')
    assert.equal(await get('#pill', 'height'), '42px')
    assert.equal(await get('#pill', 'borderRadius'), '13px')
    assert.equal(await get('#pill', 'fontSize'), '19px')
    assert.equal(await get('#nested', 'gap'), '6px')
    assert.equal(await get('#sibling', 'gap'), '6px')
    await page.locator('#pill').hover({ position: { x: 3, y: 3 } })
    assert.equal(await get('#pill', 'gap'), '23px')
    await page.locator('#pill').evaluate((el) => el.setAttribute('aria-selected', 'true'))
    assert.equal(await get('#pill', 'gap'), '29px')
    assert.equal(await get('#nested', 'gap'), '6px')
    assert.equal(await get('#field', 'gap'), '11px')
    assert.equal(await get('#field [data-part="control"]', 'borderRadius'), '14px')
    assert.equal(await get('#card', 'gap'), '16px')
    assert.equal(await get('#card', 'padding'), '18px')
    assert.equal(await get('#card', 'borderRadius'), '12px')
    await page.locator('#card').hover()
    assert.match(await get('#card', 'boxShadow'), /rgb\(0, 0, 255\).*6px/)
  } finally {
    await page.close()
  }
})

void test('configured Button duration respects reduced motion', async () => {
  const page = await render(
    true,
    '<div data-scope="button" style="--warp-button-duration:123ms">Button</div>',
  )
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const duration = await page
      .locator('[data-scope="button"]')
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    assert.ok(duration.startsWith('0s, 0s, 0s'))
  } finally {
    await page.close()
  }
})

void test('inherited configuration is read after noninheriting local inputs', async () => {
  const page = await render(
    true,
    `<div id="scope" style="--warp-config-part-pill-gap:9px;
    --warp-config-part-nav-gap:24px;--warp-config-part-tabs-underline-width:5px;
    --warp-config-part-link-underline-width:3px;--warp-config-part-field-radius:15px;
    --warp-config-part-card-padding:20px;--warp-config-part-button-duration:160ms">
    <div id="outer" data-scope="pill" style="--warp-pill-gap:17px"><span id="inner" data-scope="pill">Inner</span></div>
    <nav data-scope="nav" data-axis="y"><a aria-current="page">Nav</a></nav>
    <div data-scope="tabs" data-part="root"><div data-part="list"><i data-part="indicator"></i></div></div>
    <a data-scope="link" href="#">Link</a><div data-scope="field"><div data-part="control">Field</div></div>
    <div data-scope="card">Card</div><div data-scope="button">Button</div></div>`,
  )
  try {
    const get = (selector, key) =>
      page.locator(selector).evaluate((el, property) => getComputedStyle(el)[property], key)
    assert.equal(await get('#outer', 'gap'), '17px')
    assert.equal(await get('#inner', 'gap'), '9px')
    assert.equal(await get('[data-scope="nav"]', 'gap'), '24px')
    assert.equal(await get('[data-scope="tabs"] [data-part="indicator"]', 'blockSize'), '5px')
    assert.equal(await get('[data-scope="link"]', 'textDecorationThickness'), '3px')
    assert.equal(await get('[data-scope="field"] [data-part="control"]', 'borderRadius'), '15px')
    assert.equal(await get('[data-scope="card"]', 'padding'), '20px')
    assert.ok((await get('[data-scope="button"]', 'transitionDuration')).includes('0.16s'))
  } finally {
    await page.close()
  }
})
