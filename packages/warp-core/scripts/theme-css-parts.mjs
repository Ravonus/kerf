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
      : path === 'themed/warp.css' && process.env.WEFT_FOUNDATION_CSS
        ? process.env.WEFT_FOUNDATION_CSS
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
  'inputs/field.css',
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
      --warp-button-scale-press:.8;--warp-button-duration:123ms;--warp-button-gap:11px;
      --warp-button-gap-hover:18px;--warp-button-gap-press:22px;--warp-button-radius-hover:13px">Button</div>
    <nav id="nav" data-scope="nav" data-axis="x" style="--warp-nav-gap:19px;--warp-nav-gap-hover:27px;--warp-nav-gap-active:25px;--warp-nav-underline-width:7px;--warp-nav-padding-block:14px;--warp-nav-duration:170ms">
      <a aria-current="page">Nav</a><i data-part="indicator"></i></nav>
    <div id="tabs" data-scope="tabs" data-part="root" style="--warp-tabs-gap:21px;--warp-tabs-underline-width:8px;--warp-tabs-padding-inline:11px;--warp-tabs-padding-inline-hover:22px;--warp-tabs-padding-inline-active:33px;--warp-tabs-radius:9px;--warp-tabs-radius-active:15px;--warp-tabs-font-size:18px;--warp-tabs-duration:220ms">
      <div data-part="list"><button id="tab-trigger" data-part="trigger" aria-selected="true">Tab</button><i data-part="indicator"></i></div></div>
    <a id="link" href="#" data-scope="link" style="--warp-link-underline-width:4px;--warp-link-underline-offset:5px;--warp-link-radius:8px;--warp-link-radius-hover:12px;--warp-link-radius-press:16px;--warp-link-font-weight:600;--warp-link-duration:150ms">Link</a>
    <span id="pill" data-scope="pill" style="--warp-pill-gap:17px;--warp-pill-gap-hover:23px;
      --warp-pill-gap-active:29px;--warp-pill-height:42px;--warp-pill-radius:13px;--warp-pill-radius-hover:17px;
      --warp-pill-radius-active:21px;--warp-pill-font-size:19px;--warp-pill-duration:160ms">
      Pill <span id="nested" data-scope="pill">Nested</span></span><span id="sibling" data-scope="pill">Sibling</span>
    <div id="field" data-scope="field" style="--warp-field-gap:11px;--warp-field-radius:14px"><div data-part="control">Field</div></div>
    <div id="card" data-scope="card" style="--warp-card-gap:16px;--warp-card-padding:18px;
      --warp-card-radius:12px;--warp-card-shadow:0 0 5px red;--warp-card-shadow-hover:0 0 6px blue;--warp-card-gap-hover:31px;--warp-card-padding-hover:32px;--warp-card-radius-hover:33px">Card</div>
  `,
  )
  try {
    const button = page.locator('#button')
    const get = (selector, property) =>
      page.locator(selector).evaluate((el, key) => getComputedStyle(el)[key], property)
    assert.ok((await get('#button', 'transitionDuration')).includes('0.123s'))
    assert.match(await get('#pill', 'transitionDuration'), /0.16s/)
    assert.match(await get('#link', 'transitionDuration'), /0.15s/)
    assert.match(await get('#nav a', 'transitionDuration'), /0.17s/)
    assert.match(await get('#tab-trigger', 'transitionDuration'), /0.22s/)
    await page.addStyleTag({
      content: '* { transition: none !important; animation: none !important }',
    })
    assert.equal(await get('#button', 'gap'), '11px')
    assert.match(await get('#button', 'boxShadow'), /rgb\(255, 0, 0\).*2px/)
    await button.hover()
    assert.equal(await get('#button', 'gap'), '18px')
    assert.equal(await get('#button', 'borderRadius'), '13px')
    assert.match(await get('#button', 'boxShadow'), /rgb\(0, 0, 255\).*3px/)
    await button.evaluate((el) => el.setAttribute('data-press', ''))
    assert.match(await get('#button', 'boxShadow'), /rgb\(0, 128, 0\).*4px/)
    assert.equal(await get('#button', 'scale'), '0.8')
    assert.equal(await get('#button', 'gap'), '22px')
    assert.equal(await get('#nav', 'gap'), '25px')
    assert.equal(await get('#nav a', 'paddingTop'), '14px')
    assert.equal(
      await page.locator('#nav a').evaluate((el) => getComputedStyle(el, '::after').blockSize),
      '7px',
    )
    assert.equal(await get('#nav [data-part="indicator"]', 'blockSize'), '7px')
    assert.equal(await get('#tabs', 'gap'), '21px')
    assert.equal(await get('#tabs [data-part="indicator"]', 'blockSize'), '8px')
    assert.equal(await get('#tab-trigger', 'paddingLeft'), '33px')
    assert.equal(await get('#tab-trigger', 'borderRadius'), '15px')
    assert.equal(await get('#tab-trigger', 'fontSize'), '18px')
    await page.locator('#tab-trigger').evaluate((el) => el.removeAttribute('aria-selected'))
    await page.locator('#tab-trigger').hover()
    assert.equal(await get('#tab-trigger', 'paddingLeft'), '22px')
    assert.equal(await get('#link', 'textDecorationThickness'), '4px')
    assert.equal(await get('#link', 'textUnderlineOffset'), '5px')
    assert.equal(await get('#link', 'borderRadius'), '8px')
    assert.equal(await get('#link', 'fontWeight'), '600')
    await page.locator('#link').hover()
    assert.equal(await get('#link', 'borderRadius'), '12px')
    await page.mouse.down()
    assert.equal(await get('#link', 'borderRadius'), '16px')
    await page.mouse.up()
    await page.locator('#nav a').evaluate((el) => el.removeAttribute('aria-current'))
    await page.locator('#nav').hover()
    assert.equal(await get('#nav', 'gap'), '27px')
    assert.equal(await get('#pill', 'gap'), '17px')
    assert.equal(await get('#pill', 'height'), '42px')
    assert.equal(await get('#pill', 'borderRadius'), '13px')
    assert.equal(await get('#pill', 'fontSize'), '19px')
    assert.equal(await get('#nested', 'gap'), '6px')
    assert.equal(await get('#sibling', 'gap'), '6px')
    await page.locator('#pill').hover({ position: { x: 3, y: 3 } })
    assert.equal(await get('#pill', 'gap'), '23px')
    assert.equal(await get('#pill', 'borderRadius'), '17px')
    await page.locator('#pill').evaluate((el) => el.setAttribute('aria-selected', 'true'))
    assert.equal(await get('#pill', 'gap'), '29px')
    assert.equal(await get('#pill', 'borderRadius'), '21px')
    assert.equal(await get('#nested', 'gap'), '6px')
    assert.equal(await get('#field', 'gap'), '11px')
    assert.equal(await get('#field [data-part="control"]', 'borderRadius'), '14px')
    assert.equal(await get('#card', 'gap'), '16px')
    assert.equal(await get('#card', 'padding'), '18px')
    assert.equal(await get('#card', 'borderRadius'), '12px')
    await page.locator('#card').hover()
    assert.equal(await get('#card', 'gap'), '31px')
    assert.equal(await get('#card', 'padding'), '32px')
    assert.equal(await get('#card', 'borderRadius'), '33px')
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

void test('sweep width and clocks follow local, state and nested boundaries', async () => {
  const page = await render(
    true,
    `<div style="--warp-config-part-sweep-width:2px;--warp-config-part-sweep-duration:90ms">
    <div id="outer-sweep" data-sweep style="width:160px;height:80px;--warp-sweep-local-width:4px;--warp-sweep-local-width-hover:5px;
      --warp-sweep-local-width-active:6px;--warp-sweep-local-width-press:7px;--warp-sweep-local-duration:80ms;
      --warp-sweep-local-duration-hover:110ms;--warp-sweep-local-duration-active:120ms;--warp-sweep-local-duration-press:130ms">
      <i id="outer-stroke" data-part="sweep"></i>
      <div id="inner-sweep" data-sweep style="width:80px;height:24px"><i id="inner-stroke" data-part="sweep"></i></div>
      <div data-part="sweep-outline"><i id="segment"></i></div>
      <div data-part="sweep-corners"><i id="corner"></i></div>
    </div></div>`,
  )
  try {
    const get = (selector, property) =>
      page.locator(selector).evaluate((el, key) => getComputedStyle(el)[key], property)
    const custom = (selector, property) =>
      page
        .locator(selector)
        .evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property)
    assert.equal(await get('#outer-stroke', 'borderTopWidth'), '4px')
    assert.equal(await get('#inner-stroke', 'borderTopWidth'), '2px')
    assert.equal(await get('#corner', 'borderTopWidth'), '4px')
    assert.equal((await custom('#segment', '--_s')).trim(), '4px')
    assert.match(await custom('#outer-stroke', '--_warp-sweep-duration'), /80ms/)
    assert.match(await custom('#inner-stroke', '--_warp-sweep-duration'), /90ms/)
    await page.locator('#outer-sweep').hover({ position: { x: 3, y: 3 } })
    assert.equal(await get('#outer-stroke', 'borderTopWidth'), '5px')
    assert.match(await custom('#outer-stroke', '--_warp-sweep-duration'), /110ms/)
    await page.locator('#outer-sweep').evaluate((el) => el.setAttribute('aria-pressed', 'true'))
    assert.equal(await get('#outer-stroke', 'borderTopWidth'), '6px')
    assert.match(await custom('#outer-stroke', '--_warp-sweep-duration'), /120ms/)
    await page.locator('#outer-sweep').evaluate((el) => el.setAttribute('data-press', ''))
    assert.equal(await get('#outer-stroke', 'borderTopWidth'), '7px')
    assert.match(await custom('#outer-stroke', '--_warp-sweep-duration'), /130ms/)
    assert.equal(await get('#inner-stroke', 'borderTopWidth'), '2px')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.match(await custom('#outer-stroke', '--_warp-sweep-duration'), /\* 0/)
  } finally {
    await page.close()
  }
})

void test('field inputs follow their host and preserve nested isolation', async () => {
  const page = await render(
    true,
    `<div id="outer-field" data-scope="field" style="--warp-field-local-height:62px;
    --warp-field-padding-inline:20px;--warp-field-gap:12px;--warp-field-gap-hover:23px;
    --warp-field-font-family:monospace;--warp-field-font-size:19px;--warp-field-font-weight:700;
    --warp-field-radius:14px;--warp-field-duration:180ms;--warp-field-shadow:0 0 3px red;
    --warp-field-shadow-hover:0 0 4px blue">
    <div id="field-control" data-part="control" data-sweep><input data-part="input"></div>
    <div id="inner-field" data-scope="field"><div id="inner-control" data-part="control" data-sweep><input data-part="input"></div></div>
  </div>`,
  )
  try {
    const get = (selector, property) =>
      page.locator(selector).evaluate((el, key) => getComputedStyle(el)[key], property)
    assert.equal(await get('#field-control', 'minBlockSize'), '62px')
    assert.equal(await get('#field-control', 'paddingLeft'), '20px')
    assert.equal(await get('#field-control', 'gap'), '12px')
    assert.equal(await get('#field-control input', 'fontSize'), '19px')
    assert.equal(await get('#field-control input', 'fontWeight'), '700')
    assert.equal(await get('#field-control', 'fontFamily'), 'monospace')
    assert.match(await get('#field-control', 'transitionDuration'), /0.18s/)
    assert.match(await get('#field-control', 'boxShadow'), /rgb\(255, 0, 0\).*3px/)
    assert.notEqual(await get('#inner-control', 'minBlockSize'), '62px')
    assert.notEqual(await get('#inner-control', 'borderRadius'), '14px')
    assert.notEqual(await get('#inner-control input', 'fontSize'), '19px')
    await page.locator('#field-control').hover()
    assert.equal(await get('#field-control', 'gap'), '23px')
    assert.match(await get('#field-control', 'boxShadow'), /rgb\(0, 0, 255\).*4px/)
    await page.locator('#outer-field').evaluate((el) => {
      el.style.setProperty('--warp-field-local-height', '10px')
      el.style.setProperty('--warp-target-min', '44px')
    })
    assert.equal(await get('#field-control', 'minBlockSize'), '44px')
  } finally {
    await page.close()
  }
})
