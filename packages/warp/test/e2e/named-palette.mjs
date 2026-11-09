// Exercise the generated CSS and the real dial runtime in a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chromium } from 'playwright-core'
import { stripTypeScriptTypes } from 'node:module'
import { warp, dialScript } from '../../plugin.mjs'

const contribution = warp({
  colors: { brand: 'ink', ink: '#112233' },
  themes: { ocean: { colors: { ink: '#445566' } }, sunset: { colors: { ink: '#778899' } } },
  dials: { palette: 'ocean' },
}).contribute({ command: 'build', mode: 'production', root: process.cwd() })
const css = contribution.tokens.css
assert.ok(css.includes('--warp-palette-names:default ocean sunset'))
const runtime = stripTypeScriptTypes(
  readFileSync(new URL('../../../warp-core/src/dial.ts', import.meta.url), 'utf8'),
  { mode: 'strip' },
)
const html = `<!doctype html><html><head>${dialScript}<style>${css}.swatch{color:var(--warp-named-brand)}</style><script>
{window.headTime=performance.now();const r=document.documentElement,s=getComputedStyle(r);window.headState={attr:r.dataset.palette||null,current:s.getPropertyValue('--warp-palette-current').trim(),color:s.getPropertyValue('--warp-named-brand').trim(),expression:r.dataset.expression||null,unknown:r.dataset.evil||null}}
</script></head><body><div id="outer" class="swatch"><div id="inner" class="swatch">palette</div></div><script type="module">
import * as dial from '/dial.mjs'; window.dial=dial; dial.dialsFromUrl(); window.ready=true
</script></body></html>`
const server = createServer((req, res) => {
  if (req.url === '/dial.mjs') {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(runtime)
  } else {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}/`
let browser
try {
  browser = await chromium.launch({ headless: true })
  async function visit(raw, search = '', blocked = false) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript(
      (storage) => {
        if (storage.blocked)
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new Error('blocked')
            },
          })
        else if (storage.raw !== null) localStorage.setItem('warp:dials', storage.raw)
      },
      { raw, blocked },
    )
    await page.goto(url + search)
    await page.waitForFunction(() => window.ready === true)
    return { context, page }
  }
  let session = await visit(
    JSON.stringify({ palette: 'sunset', expression: 'vivid', evil: 'bad', theme: 'evil' }),
  )
  assert.deepEqual(await session.page.evaluate(() => window.headState), {
    attr: 'sunset',
    current: 'sunset',
    color: '#778899',
    expression: 'vivid',
    unknown: null,
  })
  assert.equal(
    await session.page.evaluate(() => document.documentElement.dataset.theme ?? null),
    null,
  )
  const paint = await session.page.evaluate(async () => {
    for (let i = 0; i < 5; i++)
      await new Promise((resolve) => {
        requestAnimationFrame(resolve)
      })
    return {
      head: window.headTime,
      first: performance.getEntriesByType('paint').find((entry) => entry.name === 'first-paint')
        ?.startTime,
    }
  })
  assert.equal(typeof paint.first, 'number')
  assert.ok(paint.head <= paint.first, 'head state must be sampled before first paint')
  assert.equal(
    await session.page.locator('#inner').evaluate((node) => getComputedStyle(node).color),
    'rgb(119, 136, 153)',
  )
  const nested = await session.page.evaluate(() => {
    const { setDial, getDial } = window.dial
    const outer = document.querySelector('#outer'),
      inner = document.querySelector('#inner')
    setDial('palette', 'ocean', { root: outer })
    setDial('palette', 'default', { root: inner })
    const read = (root) => [
      getDial('palette', root),
      getComputedStyle(root).getPropertyValue('--warp-named-brand').trim(),
    ]
    const first = [read(document.documentElement), read(outer), read(inner)]
    setDial('palette', 'auto', { root: inner })
    let rejected = false
    try {
      setDial('palette', 'unknown', { root: inner })
    } catch (error) {
      rejected = error instanceof RangeError
    }
    return { first, after: read(inner), rejected }
  })
  assert.deepEqual(nested, {
    first: [
      ['sunset', '#778899'],
      ['ocean', '#445566'],
      ['default', '#112233'],
    ],
    after: ['ocean', '#445566'],
    rejected: true,
  })
  await session.context.close()
  session = await visit(JSON.stringify({ palette: 'stale' }))
  assert.deepEqual(await session.page.evaluate(() => window.headState), {
    attr: 'stale',
    current: 'default',
    color: '#112233',
    expression: null,
    unknown: null,
  })
  await session.context.close()
  session = await visit(JSON.stringify({ palette: 'sunset' }), '?palette=ocean')
  assert.equal(await session.page.evaluate(() => window.dial.getDial('palette')), 'ocean')
  assert.equal(await session.page.evaluate(() => window.headState.current), 'sunset')
  await session.context.close()
  session = await visit(JSON.stringify({ palette: 'sunset' }), '?palette=unknown')
  assert.equal(await session.page.evaluate(() => window.dial.getDial('palette')), 'sunset')
  await session.context.close()
  session = await visit(JSON.stringify({ palette: 'sunset' }), '?palette=auto')
  assert.equal(await session.page.evaluate(() => window.dial.getDial('palette')), 'ocean')
  await session.context.close()
  for (const [raw, blocked] of [
    ['{bad', false],
    [JSON.stringify({ palette: 'auto' }), false],
    [null, true],
    [JSON.stringify({ palette: 'bad name', density: 'wrong' }), false],
  ]) {
    session = await visit(raw, '', blocked)
    assert.deepEqual(await session.page.evaluate(() => window.headState), {
      attr: null,
      current: 'ocean',
      color: '#445566',
      expression: null,
      unknown: null,
    })
    assert.equal(
      await session.page.evaluate(() => document.documentElement.dataset.density ?? null),
      null,
    )
    await session.context.close()
  }
  console.log(
    'Generated palette CSS: head snapshot, nested runtime, stale, URL and storage cases passed',
  )
} finally {
  await browser?.close()
  server.close()
}
