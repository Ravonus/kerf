// Run against the built icon page with WEFT_FLOW_URL, or the canonical CSS icon-grid fixture.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { after as afterAll, before as beforeAll, test } from 'node:test'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))(
  'playwright-core',
)
const css = readFileSync(
  new URL('../../packages/warp-core/styles/warp.css', import.meta.url),
  'utf8',
)
const flowSource = process.env.WEFT_FLOW_ORIGINAL
  ? execFileSync(
      'git',
      ['show', `${process.env.WEFT_FLOW_BASELINE ?? '1cbbad29'}:packages/warp-core/src/flow.ts`],
      {
        encoding: 'utf8',
      },
    )
  : readFileSync(new URL('../../packages/warp-core/src/flow.ts', import.meta.url), 'utf8')
const script = stripTypeScriptTypes(flowSource).replace(/^export /gm, '')
let browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function open({
  control = false,
  fallback = false,
  reduced = false,
  kind = 'icon',
  fixture = false,
} = {}) {
  const site = process.env.WEFT_FLOW_URL && !fixture
  const context = await browser.newContext({
    viewport: { width: 800, height: 700 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.flowScrolling = true
    document.addEventListener(
      'scrollend',
      (event) => {
        if (window.flowScrolling) event.stopImmediatePropagation()
      },
      true,
    )
  })
  if (site) {
    await page.goto(process.env.WEFT_FLOW_URL)
    await page.evaluate(() => scrollTo(0, 1))
    await page.waitForTimeout(50)
  } else {
    const icons = Array.from(
      { length: 12 },
      (_, i) => `<div data-flow="${kind}" style="height:100px">${i}</div>`,
    ).join('')
    await page.setContent(`<!doctype html><html data-expression="vivid" data-flow-armed>
      <style>${css}</style><style>body{margin:0}main{margin-top:1200px;display:grid;
      grid-template-columns:repeat(4,1fr);gap:12px}footer{height:1600px}</style>
      <main>${icons}</main><footer></footer>`)
    await page.evaluate(() => {
      window.flowScrolling = true
      document.addEventListener(
        'scrollend',
        (event) => {
          if (window.flowScrolling) event.stopImmediatePropagation()
        },
        true,
      )
    })
    if (!control) {
      const doc = fallback
        ? `new Proxy(document, {has: (target, key) => key !== 'onscrollend' && key in target,
          get: (target, key) => {const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value}})`
        : 'document'
      await page.addScriptTag({ content: `(() => {${script};flow(${doc})})()` })
    }
  }
  const selector = site ? '[data-flow="icon"]' : `[data-flow="${kind}"]`
  await page.evaluate((select) => {
    const targets = [...document.querySelectorAll(select)]
    const target = targets.find((el) => el.getBoundingClientRect().top > innerHeight + 100)
    assertTarget(target)
    target.dataset.flowProbe = ''
    function assertTarget(el) {
      if (!el) throw new Error('icon page has no flowed target below the fold')
    }
  }, selector)
  return { page, errors, close: () => context.close() }
}

const frame = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
const sample = (page) =>
  page.locator('[data-flow-probe]').evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      opacity: +style.opacity,
      sx: +style.getPropertyValue('--_flow-sx'),
      sy: +style.getPropertyValue('--_flow-sy'),
      rotate: parseFloat(style.getPropertyValue('--_flow-rot')),
      settled: el.hasAttribute('data-flow-settled'),
    }
  })
async function arrive(page, visible = 70) {
  await page.locator('[data-flow-probe]').evaluate((el, amount) => {
    const entry = el.getAnimations().find((a) => a.animationName?.startsWith('warp-in-'))
    const source = entry?.timeline?.source ?? document.scrollingElement
    const bottom =
      source === document.scrollingElement ? innerHeight : source.getBoundingClientRect().bottom
    source.scrollTop += el.getBoundingClientRect().top - bottom + amount
  }, visible)
  await frame(page)
  return sample(page)
}
async function stop(page) {
  await page.evaluate(() => {
    window.flowScrolling = false
    document.dispatchEvent(new Event('scrollend'))
  })
}
function whole(value) {
  assert.ok(Math.abs(value.opacity - 1) < 0.001, `opacity ${value.opacity} must finish at 1`)
  assert.ok(Math.abs(value.sx - 1) < 0.001, `scale x ${value.sx}`)
  assert.ok(Math.abs(value.sy - 1) < 0.001, `scale y ${value.sy}`)
  assert.ok(Math.abs(value.rotate) < 0.001, `rotation ${value.rotate}`)
}

test('the icon page finishes a half arrival within a second, without restarting', async () => {
  const { page, errors, close } = await open()
  try {
    const before = await arrive(page)
    assert.ok(before.opacity > 0 && before.opacity < 0.95, JSON.stringify(before))
    await stop(page)
    const start = await sample(page)
    assert.ok(start.opacity >= before.opacity - 0.01, 'settling cannot restart the arrival')
    assert.ok(start.opacity < 0.95, 'settling must continue from the current pose, not jump')
    await page.waitForTimeout(40)
    const during = await sample(page)
    assert.ok(during.opacity > before.opacity, 'settling must advance with time')
    await page.waitForTimeout(800)
    whole(await sample(page))
    assert.deepEqual(errors, [])
  } finally {
    await close()
  }
})

test('scrolling matches the original scrub, and settled departures still scrub', async () => {
  const candidate = await open()
  const control = await open({ control: true })
  try {
    for (const visible of [40, 70, 110]) {
      const a = await arrive(candidate.page, visible)
      const b = await arrive(control.page, visible)
      for (const key of ['opacity', 'sx', 'sy', 'rotate'])
        assert.ok(Math.abs(a[key] - b[key]) < 0.001, `${key}: ${a[key]} vs ${b[key]}`)
    }
    await stop(candidate.page)
    await candidate.page.waitForTimeout(650)
    await arrive(candidate.page, 40)
    whole(await sample(candidate.page))
    const top = await candidate.page.locator('[data-flow-probe]').evaluate((el) => {
      const exit = el.getAnimations().find((a) => a.animationName?.startsWith('warp-out-'))
      const source = exit?.timeline?.source ?? document.scrollingElement
      source.scrollTop += el.getBoundingClientRect().bottom - 35
      return source.scrollTop
    })
    await control.page.locator('[data-flow-probe]').evaluate((el, y) => {
      const entry = el.getAnimations().find((a) => a.animationName?.startsWith('warp-in-'))
      const source = entry?.timeline?.source ?? document.scrollingElement
      source.scrollTop = y
    }, top)
    await frame(candidate.page)
    await frame(control.page)
    const a = await sample(candidate.page)
    const b = await sample(control.page)
    assert.ok(a.opacity < 0.9, 'the departure must still fade under the header')
    assert.ok(Math.abs(a.opacity - b.opacity) < 0.001, `${a.opacity} vs ${b.opacity}`)
    await candidate.page.evaluate(() => scrollTo(0, 0))
    await candidate.page.waitForTimeout(80)
    assert.equal((await sample(candidate.page)).settled, false)
    await candidate.page.evaluate(() => {
      window.flowScrolling = true
    })
    const reentry = await arrive(candidate.page, 40)
    assert.ok(reentry.opacity < 0.95, 'an offscreen icon must scrub on reentry')
    assert.deepEqual(candidate.errors, [])
  } finally {
    await candidate.close()
    await control.close()
  }
})

test('all named flow families finish, and a page without flow adds no scroll handlers', async () => {
  for (const kind of [
    'card',
    'tile',
    'row',
    'item',
    'stat',
    'chart',
    'image',
    'heading',
    'code',
    'form',
    'deal',
    'specimen',
    'block',
    'plot',
    'icon',
  ]) {
    const { page, errors, close } = await open({ kind, fixture: true })
    try {
      const before = await arrive(page)
      assert.ok(before.opacity > 0 && before.opacity < 0.95, `${kind}: ${before.opacity}`)
      await stop(page)
      await page.waitForTimeout(650)
      whole(await sample(page))
      assert.deepEqual(errors, [], kind)
    } finally {
      await close()
    }
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.setContent(`<html data-flow-armed><style>${css}</style><p>Still</p>`)
    await page.evaluate(() => {
      window.flowListeners = []
      window.flowMotionListeners = 0
      window.flowObservers = 0
      const Observer = window.MutationObserver
      window.MutationObserver = class extends Observer {
        constructor(...args) {
          super(...args)
          window.flowObservers++
        }
      }
      const match = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const media = match(query)
        const listen = media.addEventListener.bind(media)
        media.addEventListener = (name, ...args) => {
          if (name === 'change') window.flowMotionListeners++
          return listen(name, ...args)
        }
        return media
      }
      const add = document.addEventListener.bind(document)
      document.addEventListener = (name, ...args) => {
        if (name === 'scroll' || name === 'scrollend') window.flowListeners.push(name)
        return add(name, ...args)
      }
    })
    await page.addScriptTag({
      content: `(() => {${script};const count = window.flowObservers;
        flow(document);window.flowInstalledObservers = window.flowObservers - count})()`,
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => {
      document.documentElement.dataset.motion = 'full'
    })
    await frame(page)
    assert.deepEqual(await page.evaluate(() => window.flowListeners), [])
    assert.equal(await page.evaluate(() => window.flowMotionListeners), 0)
    // Count flow's existing code-scan observer, excluding later Playwright observers.
    assert.equal(await page.evaluate(() => window.flowInstalledObservers), 1)
  } finally {
    await context.close()
  }
})

test('the 150ms fallback and reduced motion keep their contracts', async () => {
  const fallback = await open({ fallback: true, fixture: true })
  const reduced = await open({ reduced: true, fixture: true })
  try {
    await arrive(fallback.page)
    await fallback.page.waitForTimeout(850)
    whole(await sample(fallback.page))
    await arrive(reduced.page)
    whole(await sample(reduced.page))
    assert.equal((await sample(reduced.page)).settled, false)
    assert.deepEqual([...fallback.errors, ...reduced.errors], [])
  } finally {
    await fallback.close()
    await reduced.close()
  }
})

test('reduced motion interrupts an arrival already finishing', async () => {
  const { page, close } = await open({ fixture: true })
  try {
    await arrive(page)
    await stop(page)
    await page.evaluate(() => {
      document.documentElement.dataset.motion = 'reduce'
    })
    await frame(page)
    whole(await sample(page))
  } finally {
    await close()
  }
})

test('flow initialized with reduced motion settles after motion is enabled', async () => {
  for (const fallback of [false, true]) {
    for (const preference of [false, true]) {
      const { page, errors, close } = await open({ reduced: true, fallback, fixture: true })
      try {
        whole(await sample(page))
        if (preference) await page.emulateMedia({ reducedMotion: 'no-preference' })
        else
          await page.evaluate(() => {
            document.documentElement.dataset.motion = 'full'
          })
        await frame(page)
        const before = await arrive(page)
        assert.ok(before.opacity > 0 && before.opacity < 0.95, JSON.stringify(before))
        assert.equal(before.settled, false, 'motion activation must preserve scrubbing')
        await stop(page)
        await page.waitForTimeout(850)
        whole(await sample(page))
        assert.deepEqual(errors, [])
      } finally {
        await close()
      }
    }
  }
})

test('a fling during settling exposes the original departure immediately', async () => {
  const candidate = await open({ fixture: true })
  const control = await open({ control: true, fixture: true })
  try {
    await arrive(candidate.page)
    await stop(candidate.page)
    const top = await candidate.page.locator('[data-flow-probe]').evaluate((el) => {
      scrollBy(0, el.getBoundingClientRect().bottom - 35)
      return scrollY
    })
    await control.page.evaluate((y) => scrollTo(0, y), top)
    await frame(candidate.page)
    await frame(control.page)
    const a = await sample(candidate.page)
    const b = await sample(control.page)
    assert.ok(a.opacity < 0.9)
    assert.ok(Math.abs(a.opacity - b.opacity) < 0.001, `${a.opacity} vs ${b.opacity}`)
    assert.deepEqual(candidate.errors, [])
  } finally {
    await candidate.close()
    await control.close()
  }
})
