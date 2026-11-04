// @vitest-environment node
// warp.flow in Chrome, from warp's real stylesheets. view() binds to the nearest scroll container and overflow: hidden is
// one, so a single clipped ancestor silently stops an element's fade. This holds the timeline to the page.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const styles = fileURLToPath(new URL('../../warp-core/styles', import.meta.url))
// warp-core's flow(), the script that arms flow on the first scroll, as the page runs it. These pages are armed unless a test says not.
const armScript = stripTypeScriptTypes(
  readFileSync(fileURLToPath(new URL('../../warp-core/src/flow.ts', import.meta.url)), 'utf8'),
).replace(/^export /gm, '')
const read = (file) => readFileSync(join(styles, file), 'utf8')
const css = ['warp.css', 'components/base.css', 'components/surface.css', 'data/table.css']
  .filter((f) => {
    try {
      return read(f)
    } catch {
      return false
    }
  })
  .map(read)
  .join('\n')

const rows = Array.from({ length: 4 }, (_, i) => `<tr id="row-${i}"><td>Row ${i}</td></tr>`).join(
  '',
)
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
const timelines = (page, id) =>
  page.evaluate(
    (i) =>
      document
        .getElementById(i)
        .getAnimations()
        .filter((a) => a.animationName?.startsWith('warp-'))
        .map((a) => ({
          name: a.animationName,
          root: a.timeline?.source === document.scrollingElement,
          kind: a.timeline?.constructor.name,
        })),
    id,
  )

let browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function open(options, expression = 'balanced') {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, ...options })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html data-expression="${expression}" data-flow-armed><style>body{margin:0}</style><style>${css}</style><body>${PAGE}`,
  )
  return { page, close: () => context.close() }
}

test('warp clips with overflow: clip; only the page lock is overflow: hidden', () => {
  const files = readdirSync(styles, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.css'),
  )
  const hidden = files.flatMap((f) =>
    read(f)
      .split('\n')
      .filter((l) => /(^|[^-\w])overflow:\s*hidden/.test(l) && !/html/.test(l))
      .map((l) => `${f}: ${l.trim()}`),
  )
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
  const names = await Promise.all(
    ['card', 'tile', 'art', 'heading', 'flat-row'].map(
      async (id) => (await timelines(page, id))[0].name,
    ),
  )
  expect(new Set(names).size).toBe(5)
  const opacity = async () =>
    +(await page.evaluate(() => getComputedStyle(document.getElementById('card')).opacity))
  const at = async (inView) => {
    await page.evaluate((y) => {
      const top = document.getElementById('card').offsetTop
      window.scrollTo(0, top - innerHeight + y)
    }, inView)
    await page.waitForTimeout(100)
    return opacity()
  }
  expect(await at(60)).toBeLessThan(0.6) // 60px on screen is still arriving
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

test('a Shell deep in the page gates its own host, not the page: flow keeps running past it', async () => {
  // the /components hub: a Shell thumbnail ~2,500px down holds a hidden scrim, and every tile below it stopped moving
  const { page, close } = await stage(`<div style="block-size:900px"></div>
    <div data-flow="tile" id="thumb"><div data-scope="shell" id="shell"><nav></nav><div data-part="scrim" hidden></div></div></div>
    ${Array.from({ length: 6 }, (_, i) => `<div data-flow="card" id="after-${i}" style="block-size:200px">Card ${i}</div>`).join('')}
    <div style="block-size:3000px"></div>`)
  const gate = (id) =>
    page.evaluate(
      (i) =>
        getComputedStyle(i ? document.getElementById(i) : document.documentElement)
          .getPropertyValue('--warp-flow-gate')
          .trim(),
      id,
    )
  expect(await gate(null)).toBe('')
  expect(await gate('after-5')).toBe('')
  expect(await gate('thumb')).toBe('')
  expect(await gate('shell')).toBe('none') // the scrim's own host still stays out
  expect((await timelines(page, 'after-5')).length).toBeGreaterThan(0)
  await close()
})

test('a code block resting at the fold finishes its scan, and the scan runs under its text, never over it', async () => {
  const { page, close } = await stage(`<div style="block-size:560px"></div>
    <figure data-scope="codeblock" id="code" style="margin:0;block-size:240px;inline-size:600px"><pre id="pre" style="margin:0;overflow:clip">${"import { Button } from '@weft-js/warp'; ".repeat(4)}</pre></figure>
    <div style="block-size:3000px"></div>`)
  await page.waitForTimeout(1200) // the scan plays once on a timer; it never rests part way
  const m = await page.evaluate(() => {
    const c = document.getElementById('code'),
      a = getComputedStyle(c, '::after')
    return {
      scale: a.scale,
      z: a.zIndex,
      iso: getComputedStyle(c).isolation,
      bg: a.backgroundColor,
      host: getComputedStyle(c).backgroundColor,
    }
  })
  expect(m.scale).toBe('0 1') // done: part way was the state that cut lines at a fixed column
  expect(m.z).toBe('-1')
  expect(m.iso).toBe('isolate')
  // the text paints above the scan: the pixel under a glyph's stem is the ink, not the scan's ground
  const box = await page.evaluate(() => {
    const b = document.getElementById('pre').getBoundingClientRect()
    return { x: b.left, y: b.top, w: b.width, h: b.height }
  })
  const shot = await page.screenshot({
    clip: { x: box.x, y: box.y, width: Math.ceil(box.w), height: Math.ceil(box.h) },
  })
  const inked = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data,
      cols = new Set()
    for (let i = 0; i < d.length; i += 4)
      if (d[i] + d[i + 1] + d[i + 2] < 450) cols.add((i / 4) % img.width)
    return { cols: cols.size, width: img.width, last: Math.max(...cols) }
  }, shot.toString('base64'))
  expect(inked.last).toBeGreaterThan(inked.width * 0.95) // ink reaches the box's end: nothing covers the lines' tails
  await close()
})

const ABOVE = `<div style="block-size:900px"></div>`
const BELOW = `<div style="block-size:3000px"></div>`
async function stage(body, { expression = 'balanced', head = '' } = {}) {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 } })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html data-expression="${expression}" data-flow-armed><style>body{margin:0}${head}</style><style>${css}</style><body>${body}`,
  )
  await page.waitForTimeout(50)
  return { page, close: () => context.close() }
}
const fixedAt = (page, id) =>
  page.evaluate((i) => {
    const r = document.querySelector(`#${i} i`).getBoundingClientRect()
    return [Math.round(r.left), Math.round(r.top)]
  }, id)
const style = (page, id, prop) =>
  page.evaluate(([i, p]) => getComputedStyle(document.getElementById(i))[p], [id, prop])
const scroll = async (page, top) => {
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), top)
  await page.waitForTimeout(120)
}

test('a fixed child sits where it asked at rest, in every family that moves', async () => {
  const fixed = '<i style="position:fixed;top:40px;left:50px;inline-size:4px;block-size:4px"></i>'
  const families = [
    'surface',
    'tile',
    'image',
    'chart',
    'row',
    'item',
    'heading',
    'deal',
    'specimen',
    'block',
    'plot',
    'icon',
  ]
  const attr = (f) => (f === 'surface' ? 'data-scope="surface"' : `data-flow="${f}"`)
  const { page, close } = await stage(
    `<div style="block-size:60px"></div>${families.map((f) => `<div ${attr(f)} id="${f}" style="block-size:36px">${fixed}</div>`).join('')}${BELOW}`,
  ) // all at rest: clear of the bar, past their entry
  await scroll(page, 0)
  for (const f of families) expect([f, ...(await fixedAt(page, f))]).toEqual([f, 50, 40])
  await close()
})

test('the move survives: an arriving element is still offset, then rests on none', async () => {
  const { page, close } = await stage(
    `${ABOVE}<div data-scope="surface" id="card" style="block-size:300px"></div>${BELOW}`,
  )
  await scroll(page, 900 - 700 + 40)
  expect(await style(page, 'card', 'translate')).not.toBe('none')
  expect(await style(page, 'card', 'scale')).not.toBe('none')
  await scroll(page, 700)
  expect(await style(page, 'card', 'translate')).toBe('none')
  expect(await style(page, 'card', 'scale')).toBe('none')
  await close()
})

test("a component's own translate and scale still apply at rest, and no transition chases the scroll", async () => {
  const head =
    '@layer warp.components { #card { translate: 0 -3px; scale: 1.01; transition: translate 1s, scale 1s } }'
  const { page, close } = await stage(
    `<div data-scope="surface" id="card" style="block-size:300px"></div>${BELOW}`,
    { head },
  )
  await scroll(page, 0)
  expect(await style(page, 'card', 'translate')).toBe('0px -3px')
  expect(await style(page, 'card', 'scale')).toBe('1.01')
  await scroll(page, 240)
  const running = await page.evaluate(
    () =>
      document
        .getElementById('card')
        .getAnimations()
        .filter((a) => a.constructor.name === 'CSSTransition').length,
  )
  expect(running).toBe(0)
  await close()
})

test.each(['quiet', 'balanced', 'vivid'])(
  '%s: leaving text stays readable down to the sticky header, then goes',
  async (expression) => {
    for (const height of [120, 420, 2000]) {
      const { page, close } = await stage(
        `${ABOVE}<div data-flow="card" id="card" style="block-size:${height}px"></div>${BELOW}`,
        { expression, head: ':root { --warp-flow-top: 57px }' },
      )
      const bottom = (at) =>
        scroll(page, 900 + height - at)
          .then(() => style(page, 'card', 'opacity'))
          .then(Number)
      expect(await bottom(58), `${height} at the header`).toBeGreaterThan(0.55)
      await close()
    }
  },
)

test('nothing at rest has started to leave, and a leaving block visibly does', async () => {
  const { page, close } = await stage(
    `<div style="block-size:60px"></div><div data-flow="card" id="card" style="block-size:300px"></div>${ABOVE}${BELOW}`,
    { expression: 'vivid' },
  )
  await scroll(page, 0)
  expect(+(await style(page, 'card', 'opacity'))).toBe(1)
  await scroll(page, 330) // its last 30px are under a bar it can't see: the fade has run on
  expect(+(await style(page, 'card', 'opacity'))).toBeLessThan(0.75)
  await close()
})

test('inside a flowed element each one leaves on its own: what sits at the top of a tall host fades as it passes', async () => {
  // /examples, a frame, an art piece: a heading or a code pane at the top of a tall host sat whole until the host's far end left
  const { page, close } = await stage(
    `${ABOVE}<div data-flow="card" id="outer" style="block-size:900px"><h2 data-flow="heading" id="head" style="margin:0;block-size:40px">Head</h2><figure data-scope="codeblock" id="inner" style="margin:0;block-size:100px"></figure><div style="block-size:760px"></div></div>${BELOW}`,
    { expression: 'vivid', head: ':root { --warp-flow-top: 57px }' },
  )
  expect((await timelines(page, 'inner')).map((t) => t.name)).toEqual([
    'warp-in-fade',
    'warp-out-fade',
  ])
  expect((await timelines(page, 'head')).map((t) => t.name)).toEqual([
    'warp-in-heading',
    'warp-out-fade',
  ])
  await scroll(page, 900 + 140 - 57) // the code's bottom edge at the header
  expect(+(await style(page, 'inner', 'opacity'))).toBeLessThan(0.75)
  expect(+(await style(page, 'head', 'opacity'))).toBeLessThan(0.3)
  expect(+(await style(page, 'outer', 'opacity'))).toBe(1) // its end is still far below
  await close()
})

test('a code block in a card that rises in waits under the fold where it is drawn, and scans the moment it shows', async () => {
  // /examples: the block's own box had entered while the rising card still held it under the fold, so it scanned unseen
  const context = await browser.newContext({ viewport: { width: 800, height: 700 } })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html data-expression="vivid" data-flow-armed><style>body{margin:0}</style><style>${css}</style><body><div style="block-size:900px"></div><div data-flow="card" id="card" style="block-size:600px"><figure data-scope="codeblock" id="code" style="margin:0;block-size:200px"></figure></div><div style="block-size:1400px"></div><script>${armScript};flow(document)</script>`,
  )
  const at = () =>
    page.evaluate(() => {
      const c = document.getElementById('code')
      return {
        top: c.getBoundingClientRect().top,
        wait: c.hasAttribute('data-flow-scan'),
        x: parseFloat(getComputedStyle(c, '::after').scale),
      }
    })
  await scroll(page, 900 - 700 + 10) // its own box 10px in; the card, at the start of its rise, draws it lower
  const under = await at()
  expect(under.top).toBeGreaterThan(700)
  expect([under.wait, under.x]).toEqual([true, 1])
  await scroll(page, 900 - 700 + 200) // drawn on screen now: it lets go and the scan plays
  const shown = await at()
  expect(shown.top).toBeLessThan(700)
  expect(shown.wait).toBe(false)
  expect(shown.x).toBeLessThan(1)
  await scroll(page, 0) // back under the fold: waiting whole again, at once
  expect(await at()).toMatchObject({ wait: true, x: 1 })
  await scroll(page, 900 - 700 + 200)
  await scroll(page, 2400) // scrolled past, above the screen
  await scroll(page, 0) // and one jump to below it, never crossing the screen: waiting again
  expect(await at()).toMatchObject({ wait: true, x: 1 })
  await context.close()
})

// Every family names an entry and an exit, and each pair is its own. Only fields (and a focused or targeted element,
// above) stay whole: a form someone is filling must not fade under their cursor.
const FAMILIES = {
  card: ['data-flow="card"', 'warp-in-card', 'warp-out-card'],
  surface: ['data-scope="surface"', 'warp-in-card', 'warp-out-card'],
  tile: ['data-flow="tile"', 'warp-in-tile', 'warp-out-card'],
  row: ['data-flow="row"', 'warp-in-row', 'warp-out-row'],
  item: ['data-flow="item"', 'warp-in-item', 'warp-out-fade'],
  stat: ['data-flow="stat"', 'warp-in-fade', 'warp-out-fade'],
  chart: ['data-flow="chart"', 'warp-in-chart', 'warp-out-chart'],
  image: ['data-flow="image"', 'warp-in-image', 'warp-out-image'],
  heading: ['data-flow="heading"', 'warp-in-heading', 'warp-out-fade'],
  code: ['data-flow="code"', 'warp-in-fade', 'warp-out-fade'],
  deal: ['data-flow="deal"', 'warp-in-deal', 'warp-out-card'],
  specimen: ['data-flow="specimen"', 'warp-in-specimen', 'warp-out-specimen'],
  block: ['data-flow="block"', 'warp-in-block', 'warp-out-block'],
  plot: ['data-flow="plot"', 'warp-in-plot', 'warp-out-plot'],
  icon: ['data-flow="icon"', 'warp-in-icon', 'warp-out-icon'],
}
test('every flow family has an entry and an exit; only fields stay whole', async () => {
  const { page, close } = await stage(
    `${ABOVE}${Object.entries(FAMILIES)
      .map(([f, [attr]]) => `<div ${attr} id="fam-${f}" style="block-size:40px"></div>`)
      .join('')}<div data-scope="field" id="fam-field"><input></div>${BELOW}`,
  )
  for (const [f, [, entry, exit]] of Object.entries(FAMILIES)) {
    const names = (await timelines(page, `fam-${f}`)).map((t) => t.name)
    expect([f, names[0], names[1]]).toEqual([f, entry, exit])
    expect(names[1], f).not.toBe('warp-out-none')
  }
  expect((await timelines(page, 'fam-field')).map((t) => t.name)).toEqual([
    'warp-in-fade',
    'warp-out-none',
  ])
  await close()
})

test("a live example's host moves for what it shows: specimen, block and plot are each their own", async () => {
  const pairs = Object.entries(FAMILIES).map(([, [, i, o]]) => `${i}+${o}`)
  for (const f of ['specimen', 'block', 'plot', 'icon'])
    expect(pairs.filter((p) => p === `${FAMILIES[f][1]}+${FAMILIES[f][2]}`).length, f).toBe(1)
  const { page, close } = await stage(
    `${ABOVE}<div data-flow="specimen" id="s" style="block-size:300px"></div><div data-flow="block" id="b" style="block-size:300px"></div><div data-flow="plot" id="p" style="block-size:300px"></div>${BELOW}`,
    { expression: 'vivid' },
  )
  await scroll(page, 900 - 700 + 40) // the specimen's top 40px are in: all three still arriving
  const moved = await page.evaluate(() =>
    ['s', 'b', 'p'].map((id) => {
      const c = getComputedStyle(document.getElementById(id))
      return [c.scale, c.translate, c.transformOrigin]
    }),
  )
  expect(moved[0][0]).not.toBe('none') // a specimen grows in about its centre, with no travel
  expect(+moved[0][0].split(' ')[0]).toBeLessThan(1)
  expect(moved[0][1]).toBe('none')
  expect(moved[1][1]).not.toBe('none') // a block rises as it unfolds from its top edge
  expect(moved[1][2]).toMatch(/ 0px$/)
  expect(moved[2][2]).toMatch(/^0px /) // a plot opens from its left edge
  await close()
})

test("icon cells in a virtual window flow on the window's timeline; reduced motion still holds them", async () => {
  const cells = Array.from(
    { length: 6 },
    (_, i) => `<button data-flow="icon" id="cell-${i}">i</button>`,
  ).join('')
  const body = `<div data-scope="virtual" id="win" style="block-size:200px;overflow:auto"><div data-part="spacer" style="block-size:1200px;position:relative"><div data-part="row" style="position:absolute;inset-block-start:600px">${cells}</div><div data-part="row" data-probe="" style="visibility:hidden"><button data-flow="icon" id="probe">p</button></div></div></div>${BELOW}`
  const { page, close } = await stage(body)
  const list = await timelines(page, 'cell-0')
  expect(list.map((t) => t.name)).toEqual(['warp-in-icon', 'warp-out-icon'])
  expect(list.every((t) => !t.root)).toBe(true) // the window's own scroller, not the page
  expect(await timelines(page, 'probe')).toEqual([])
  await close()
  const context = await browser.newContext({
    viewport: { width: 800, height: 700 },
    reducedMotion: 'reduce',
  })
  const quiet = await context.newPage()
  await quiet.setContent(
    `<!doctype html><html><style>body{margin:0}</style><style>${css}</style><body>${body}`,
  )
  expect(await timelines(quiet, 'cell-0')).toEqual([])
  await context.close()
})

test('prose flows by itself: its paragraphs, lists and quotes as items, tables as cards, a bare pre as code, only the top level', async () => {
  // a docs page used to tag each block with data-flow at build time, because warp's prose family named only h2 and h3
  const { page, close } = await stage(`<div style="block-size:900px"></div>
    <div data-scope="prose">
      <h2 id="p-h2">Heading</h2><p id="p-p">Words</p><ul id="p-ul"><li><p id="p-li-p">In a list</p></li></ul><ol id="p-ol"><li>One</li></ol>
      <blockquote id="p-quote">Quote</blockquote><pre id="p-pre" style="overflow:auto">code</pre><table id="p-table"><tbody><tr><td>Cell</td></tr></tbody></table>
      <figure id="p-figure" style="margin:0">Art</figure>
    </div>
    <p data-flow="item" id="item">Item</p><div data-flow="card" id="card-twin">Card</div>
    <div style="block-size:3000px"></div>`)
  const names = async (id) => (await timelines(page, id)).map((t) => [t.name, t.kind, t.root])
  const item = await names('item'),
    card = await names('card-twin')
  expect(item.length).toBe(2)
  for (const id of ['p-p', 'p-ul', 'p-ol', 'p-quote']) expect(await names(id), id).toEqual(item) // what data-flow="item" gave them
  expect(await names('p-table')).toEqual(card)
  expect((await names('p-pre')).map((n) => n[0])).toEqual(['warp-in-fade', 'warp-out-fade'])
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('p-pre')).overflowX),
  ).toBe('auto') // keeps its own scrolling
  expect((await names('p-figure'))[0][0]).toBe('warp-in-image')
  expect((await names('p-h2'))[0][0]).toBe('warp-in-heading')
  expect(await timelines(page, 'p-li-p')).toEqual([]) // moves with its list
  await close()
})

test('a heading leaves with its section: it fades as it goes under the header, with no move, and is whole at rest', async () => {
  const { page, close } = await stage(
    `<div style="block-size:60px"></div><h2 data-flow="heading" id="h" style="margin:0;block-size:40px">Heading</h2><div data-flow="item" id="words" style="block-size:300px"></div>${ABOVE}${BELOW}`,
    { expression: 'vivid' },
  )
  expect((await timelines(page, 'h')).map((t) => t.name)).toEqual([
    'warp-in-heading',
    'warp-out-fade',
  ])
  await scroll(page, 0)
  expect(+(await style(page, 'h', 'opacity'))).toBe(1)
  await scroll(page, 100) // its bottom edge has passed under the bar
  expect(+(await style(page, 'h', 'opacity'))).toBeLessThan(0.75)
  expect(await style(page, 'h', 'translate')).toBe('none')
  await close()
})

const FIRST = `<div data-scope="surface" id="first" style="block-size:200px">First</div><div style="block-size:1500px"></div>
  <div data-scope="surface" id="later" style="block-size:200px">Later</div><p data-flow="item" id="words">Words</p><div style="block-size:1500px"></div>`
async function unarmed() {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 } })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html data-expression="vivid"><style>body{margin:0}</style><style>${css}</style><body>${FIRST}<script>${armScript};flow(document)</script>`,
  )
  await page.waitForTimeout(50)
  return { page, close: () => context.close() }
}
const moving = (page, id) =>
  page.evaluate(
    (i) =>
      document
        .getElementById(i)
        .getAnimations()
        .filter((a) => a.animationName?.startsWith('warp-')).length,
    id,
  )
const opacityOf = (page, id) =>
  page.evaluate((i) => +getComputedStyle(document.getElementById(i)).opacity, id)

test('flow waits for a person: before the first scroll nothing moves, and text below the fold is whole for a crawler or an audit', async () => {
  const { page, close } = await unarmed()
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-flow-armed'))).toBe(
    false,
  )
  for (const id of ['first', 'later', 'words']) {
    expect(await moving(page, id), id).toBe(0)
    expect(await opacityOf(page, id), id).toBe(1)
  }
  await close()
})

test('the first scroll arms it: what was on screen stays put, what is below rises in as it arrives', async () => {
  const { page, close } = await unarmed()
  await page.mouse.wheel(0, 1)
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-flow-armed'))).toBe(
    true,
  )
  expect(
    await page.evaluate(() => document.getElementById('first').hasAttribute('data-flow-seen')),
  ).toBe(true)
  expect(await moving(page, 'first')).toBe(0) // no part-faded jump on the first screen
  expect(await moving(page, 'later')).toBeGreaterThan(0)
  expect(await opacityOf(page, 'later')).toBe(0) // waiting below the fold, now that someone is scrolling
  await page.evaluate(() =>
    document.getElementById('later').scrollIntoView({ block: 'center', behavior: 'instant' }),
  )
  await page.waitForTimeout(100)
  expect(await opacityOf(page, 'later')).toBe(1)
  await close()
})
