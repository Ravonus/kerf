// @vitest-environment node
// warp.flow in Chrome, from warp's real stylesheets. view() binds to the nearest scroll container and overflow: hidden is
// one, so a single clipped ancestor silently stops an element's fade. This holds the timeline to the page.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const styles = fileURLToPath(new URL('../../warp-core/styles', import.meta.url))
const read = file => readFileSync(join(styles, file), 'utf8')
const css = ['warp.css', 'components/base.css', 'components/surface.css', 'data/table.css'].filter(f => { try { return read(f) } catch {} }).map(read).join('\n')

const rows = Array.from({ length: 4 }, (_, i) => `<tr id="row-${i}"><td>Row ${i}</td></tr>`).join('')
const PAGE = `
  <div style="block-size:1200px" id="top"></div>
  <div id="clip" style="overflow:clip">
    <div data-scope="surface" id="card" style="block-size:200px">Card</div>
    <div data-flow="tile" id="tile" style="block-size:200px">Tile</div>
    <figure id="art" style="block-size:200px;margin:0">Art</figure>
    <div data-flow="heading" id="heading">Heading</div>
    <div data-flow="row" id="flat-row">Row</div>
  </div>
  <div data-scope="table" id="table"><div data-part="viewport"><table><tbody>${rows}</tbody></table></div></div>
  <div data-scope="field" id="field"><input id="input"></div>
  <div id="many">${Array.from({ length: 122 }, (_, i) => `<div data-flow="card" id="many-${i}" style="block-size:10px"></div>`).join('')}</div>
  <div style="block-size:1600px"></div>`

const flowed = ['card', 'tile', 'art', 'heading', 'flat-row', 'row-0', 'row-3']
const timelines = (page, id) => page.evaluate(i => document.getElementById(i).getAnimations()
  .filter(a => a.animationName?.startsWith('warp-'))
  .map(a => ({ name: a.animationName, root: a.timeline?.source === document.scrollingElement, kind: a.timeline?.constructor.name })), id)

let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

async function open(options, expression = 'balanced') {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, ...options })
  const page = await context.newPage()
  await page.setContent(`<!doctype html><html data-expression="${expression}"><style>body{margin:0}</style><style>${css}</style><body>${PAGE}`)
  return { page, close: () => context.close() }
}

test('warp clips with overflow: clip; only the page lock is overflow: hidden', () => {
  const files = readdirSync(styles, { recursive: true }).filter(f => f.endsWith('.css'))
  const hidden = files.flatMap(f => read(f).split('\n').filter(l => /(^|[^-\w])overflow:\s*hidden/.test(l) && !/html/.test(l)).map(l => `${f}: ${l.trim()}`))
  expect(hidden).toEqual([])
})

test('every flowed element runs on the root scroller', async () => {
  const { page, close } = await open()
  for (const id of flowed) {
    const list = await timelines(page, id)
    expect(list.length, id).toBeGreaterThan(0)
    for (const t of list) expect([id, t.kind, t.root]).toEqual([id, 'ViewTimeline', true])
  }
  await close()
})

test('families move differently, and the arrival is long enough to see', async () => {
  const { page, close } = await open(undefined, 'vivid')
  const names = await Promise.all(['card', 'tile', 'art', 'heading', 'flat-row'].map(async id => (await timelines(page, id))[0].name))
  expect(new Set(names).size).toBe(5)
  const opacity = async () => +(await page.evaluate(() => getComputedStyle(document.getElementById('card')).opacity))
  const at = async inView => {
    await page.evaluate(y => {
      const top = document.getElementById('card').offsetTop
      window.scrollTo(0, top - innerHeight + y)
    }, inView)
    await page.waitForTimeout(100)
    return opacity()
  }
  expect(await at(60)).toBeLessThan(0.6)   // 60px on screen is still arriving
  expect(await at(190)).toBeGreaterThan(0.75)
  expect(await at(420)).toBe(1)
  await close()
})

test('the gates hold: reduced motion, print, focus and the 120-sibling cap', async () => {
  const reduced = await open({ reducedMotion: 'reduce' })
  expect(await timelines(reduced.page, 'card')).toEqual([])
  await reduced.close()

  const printed = await open()
  await printed.page.emulateMedia({ media: 'print' })
  expect(await timelines(printed.page, 'card')).toEqual([])
  await printed.close()

  const { page, close } = await open()
  expect((await timelines(page, 'field')).length).toBeGreaterThan(0)
  await page.focus('#input')
  expect(await timelines(page, 'field')).toEqual([])
  expect((await timelines(page, 'many-119')).length).toBeGreaterThan(0)
  expect(await timelines(page, 'many-120')).toEqual([])
  await close()
})
