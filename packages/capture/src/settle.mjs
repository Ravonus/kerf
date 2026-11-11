// When a page may be captured: a weft stage says so (`data-stage-ready` is the offset it drew at); any page also
// waits for its transitions, fonts and the images in view.

/** The page's sections, `selector` in document order, in CSS px from the document's top. */
export function sections(page, selector = 'section') {
  return page.evaluate((sel) => {
    const list = [...document.querySelectorAll(sel)].map((el, index) => {
      const box = el.getBoundingClientRect()
      return {
        index,
        id: el.id || null,
        top: Math.round(box.top + scrollY),
        height: Math.round(box.height),
      }
    })
    const documentHeight = document.documentElement.scrollHeight
    return { viewportHeight: innerHeight, documentHeight, sections: list }
  }, selector)
}

/** Waits for every stage to draw once, then stops its clock at `seconds` (null leaves it running). */
export async function stageReady(page, seconds = 0, timeout = 60_000) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-stage]')].every((el) =>
        el.hasAttribute('data-stage-ready'),
      ),
    null,
    { timeout },
  )
  if (seconds === null) return
  await page.evaluate((at) => {
    for (const el of document.querySelectorAll('[data-stage]'))
      Reflect.get(el, Symbol.for('weft.stage'))?.freeze(at)
  }, seconds)
}

/** In the page: fonts, then the images in view, then running CSS transitions, each with a time limit. */
const QUIET = async (limit) => {
  const cap = (p) =>
    Promise.race([
      p,
      new Promise((done) => {
        setTimeout(done, limit)
      }),
    ])
  await cap(document.fonts.ready)
  const seen = [...document.images].filter((img) => {
    const box = img.getBoundingClientRect()
    return box.bottom > 0 && box.top < innerHeight && box.width > 0
  })
  await cap(Promise.all(seen.map((img) => img.decode().catch(() => {}))))
  const moving = document.getAnimations().filter((a) => a instanceof CSSTransition)
  await cap(Promise.all(moving.map((a) => a.finished.catch(() => {}))))
}

/** Scrolls to `y` at once, waits until the page has settled there, and resolves with the offset it took. */
export async function scrollAndSettle(page, y, timeout = 30_000) {
  const at = await page.evaluate((top) => {
    scrollTo({ top, behavior: 'instant' })
    return Math.round(scrollY)
  }, y)
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(done))
      }),
  )
  await page.waitForFunction(
    (offset) =>
      [...document.querySelectorAll('[data-stage]')].every((el) =>
        ['poster', String(offset)].includes(el.getAttribute('data-stage-ready') ?? ''),
      ),
    at,
    { timeout, polling: 'raf' },
  )
  await page.evaluate(QUIET, 5_000)
  return at
}
