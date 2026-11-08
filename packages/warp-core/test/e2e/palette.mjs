// Exercise palette inheritance in a real browser with static metadata, before config integration.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { after, before, test } from 'node:test'

const require = createRequire(
  process.env.WEFT_PALETTE_PLAYWRIGHT ?? new URL('../../../warp/package.json', import.meta.url),
)
const { chromium } = require('playwright-core')
const source = process.env.WEFT_PALETTE_SOURCE ?? new URL('../../src/dial.ts', import.meta.url)
const script = stripTypeScriptTypes(readFileSync(source, 'utf8')).replace(/^export /gm, '')
const html = `<!doctype html><style>
:root { --warp-palette-names: default ocean sunset; --warp-palette-default: ocean;
  --warp-palette-current: ocean; }
[data-palette="default"] { --warp-palette-current: default }
[data-palette="ocean"] { --warp-palette-current: ocean }
[data-palette="sunset"] { --warp-palette-current: sunset }
</style><div id="parent"><div id="child"></div></div>`
let browser, server, origin
before(async () => {
  server = createServer((_, response) => response.end(html))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
})

async function fixture() {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(origin)
  await page.addScriptTag({
    content: `${script}\nwindow.dial = { setDial, getDial, dialsFromUrl }`,
  })
  return { page, context }
}

test('switches synchronously and respects inherited nested boundaries', async () => {
  const { page, context } = await fixture()
  try {
    const result = await page.evaluate(() => {
      const { setDial, getDial } = window.dial
      const parent = document.querySelector('#parent')
      const child = document.querySelector('#child')
      const events = []
      document.addEventListener('warp:dial', (event) => events.push(event.detail))
      const values = [getDial('palette', child)]
      setDial('palette', 'sunset', { root: parent })
      values.push(parent.dataset.palette, getDial('palette', child))
      setDial('palette', 'default', { root: child })
      values.push(getDial('palette', child), getDial('palette', parent))
      setDial('palette', 'auto', { root: child })
      values.push(child.hasAttribute('data-palette'), getDial('palette', child))
      setDial('theme', 'dark', { root: parent })
      values.push(getDial('theme', parent), getDial('palette', child))
      return { values, events }
    })
    assert.deepEqual(result.values, [
      'ocean',
      'sunset',
      'sunset',
      'default',
      'sunset',
      false,
      'sunset',
      'dark',
      'sunset',
    ])
    assert.deepEqual(
      result.events.map(({ name, value }) => [name, value]),
      [
        ['palette', 'sunset'],
        ['palette', 'default'],
        ['palette', 'auto'],
        ['theme', 'dark'],
      ],
    )
  } finally {
    await context.close()
  }
})

test('rejects invalid writes atomically and handles URL, storage and no metadata', async () => {
  const { page, context } = await fixture()
  try {
    const result = await page.evaluate(() => {
      const { setDial, getDial, dialsFromUrl } = window.dial
      const child = document.querySelector('#child')
      let events = 0
      document.addEventListener('warp:dial', () => events++)
      const failures = []
      for (const [value, options] of [
        ['unknown', { persist: true, url: true }],
        ['ocean', { root: child, persist: true }],
        ['ocean', { root: child, url: true }],
      ]) {
        try {
          setDial('palette', value, options)
          failures.push(false)
        } catch (error) {
          failures.push(error instanceof RangeError)
        }
      }
      const before = [
        document.documentElement.getAttribute('data-palette'),
        child.getAttribute('data-palette'),
        localStorage.getItem('warp:dials'),
        location.search,
        events,
      ]
      setDial('palette', 'ocean', { persist: true, url: true })
      const saved = [
        document.documentElement.dataset.palette,
        JSON.parse(localStorage.getItem('warp:dials')).palette,
        location.search,
      ]
      setDial('palette', 'auto', { persist: true, url: true })
      const reset = [
        document.documentElement.hasAttribute('data-palette'),
        JSON.parse(localStorage.getItem('warp:dials')).palette ?? null,
        location.search,
      ]
      dialsFromUrl('?palette=sunset')
      const fromUrl = document.documentElement.dataset.palette
      document.querySelector('style').remove()
      let rejects = false
      try {
        setDial('palette', 'ocean')
      } catch (error) {
        rejects = error instanceof RangeError
      }
      setDial('palette', 'default')
      return { failures, before, saved, reset, fromUrl, rejects, noConfig: getDial('palette') }
    })
    assert.deepEqual(result.failures, [true, true, true])
    assert.deepEqual(result.before, [null, null, null, '', 0])
    assert.deepEqual(result.saved, ['ocean', 'ocean', '?palette=ocean'])
    assert.deepEqual(result.reset, [false, null, ''])
    assert.equal(result.fromUrl, 'sunset')
    assert.equal(result.rejects, true)
    assert.equal(result.noConfig, 'default')
  } finally {
    await context.close()
  }
})
