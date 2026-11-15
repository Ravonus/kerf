import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { automaticFixture, automaticServer } from './auto-media-fixture.mjs'
const { chromium } = createRequire(new URL('../../../veneer/package.json', import.meta.url))(
  'playwright-core',
)
let fixture, server, browser
try {
  fixture = await automaticFixture()
  server = await automaticServer(join(fixture.root, 'dist'))
  assert.match(fixture.agents, /frame-zero stills automatically/)
  browser = await chromium.launch({
    headless: true,
    ...(process.env.KERF_CHROME ? { executablePath: process.env.KERF_CHROME } : {}),
  })
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1.5,
    }),
    page = await context.newPage()
  const warmed = new Set(),
    cached = new Set(),
    errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'fetch' && response.url().endsWith('.mp4')) {
      await response.finished()
      warmed.add(response.url())
    }
  })
  const cdp = await context.newCDPSession(page),
    urls = new Map()
  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', (event) => urls.set(event.requestId, event.request.url))
  cdp.on('Network.requestServedFromCache', (event) => cached.add(urls.get(event.requestId)))
  cdp.on('Network.responseReceived', (event) => {
    if (event.response.fromDiskCache) cached.add(event.response.url)
  })
  await page.goto(server.url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('video').videoWidth === 960)
  const distant = page.locator('video[aria-label="Distant"]')
  await page.waitForFunction(() =>
    document.querySelector('video[aria-label="Distant"]').hasAttribute('data-media-source'),
  )
  const source = await distant.getAttribute('data-media-source')
  for (let i = 0; i < 60 && ![...warmed].some((url) => url.endsWith(source)); i++)
    await page.waitForTimeout(250)
  assert.ok(
    [...warmed].some((url) => url.endsWith(source)),
    'offscreen standard Media warmed without site code',
  )
  await distant.scrollIntoViewIfNeeded()
  await distant.evaluate((video) => video.play())
  await page.waitForTimeout(2600)
  assert.equal(await distant.evaluate((video) => video.videoWidth), 960)
  assert.ok(
    [...cached].some((url) => url?.endsWith(source)),
    'native playback reused the complete cached response',
  )
  assert.equal(
    server.transfers.filter((url) => url === source).length,
    1,
    'playback made no second media transfer',
  )
  assert.ok(
    !server.transfers.some((url) => url.includes('-original-')),
    'warming never downloads Save originals',
  )
  const foreground = page.locator('video[aria-label="Foreground"]')
  await foreground.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  assert.equal(await foreground.evaluate((video) => video.videoWidth), 960)
  assert.equal(await foreground.getAttribute('data-media-preparing'), null)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      standardMedia: true,
      decodedWidth: 960,
      offscreenWarmed: true,
      nativeCacheHit: true,
      scrollReturn: true,
      originalRequests: 0,
      agentGuidance: true,
    }),
  )
} finally {
  await browser?.close()
  await server?.close()
  if (fixture) rmSync(fixture.root, { recursive: true, force: true })
}
