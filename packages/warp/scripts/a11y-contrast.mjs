import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const luminance = ([r, g, b]) => {
  const c = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Clipped out of sight: a sweep's two copies of its text take turns behind clip-path, and the one out of sight has no
 * contrast to measure. Only a clip excuses text, and only if a probe colour shows none of it reached the screen, so
 * text that's merely the colour of its background still fails.
 */
async function clippedAway(page, sel, { x, y, width, height }) {
  const clipped = await page.evaluate((css) => {
    for (let e = document.querySelector(css); e; e = e.parentElement)
      if (getComputedStyle(e).clipPath !== 'none') return true
    return false
  }, sel)
  if (!clipped) return false
  const probe = await page.addStyleTag({
    content: `${sel}, ${sel} * { color: #f0f !important; fill: #f0f !important; -webkit-text-fill-color: #f0f !important; text-shadow: none !important; }`,
  })
  const png = await page.screenshot({ clip: { x, y, width, height }, animations: 'disabled' })
  await probe.evaluate((n) => n.remove())
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const cx = Object.assign(document.createElement('canvas'), {
      width: img.width,
      height: img.height,
    }).getContext('2d')
    cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, img.width, img.height).data
    for (let p = 0; p < d.length; p += 4)
      if (d[p] > 180 && d[p + 1] < 90 && d[p + 2] > 180) return false
    return true
  }, png.toString('base64'))
}

/** The element, its ancestors, everything animating, and the viewport, as they are right now. */
async function evidence(page, sel, info) {
  const state = await page.evaluate(
    ({ css, box }) => {
      const props = [
        'display',
        'visibility',
        'opacity',
        'backgroundColor',
        'backgroundImage',
        'color',
        'clipPath',
        'transform',
        'scale',
        'translate',
        'filter',
        'mixBlendMode',
        'transitionProperty',
        'transitionDuration',
        'zIndex',
        'position',
        'isolation',
      ]
      const read = (e) => {
        const cs = getComputedStyle(e),
          r = e.getBoundingClientRect()
        return {
          tag: e.tagName.toLowerCase(),
          scope: e.dataset?.scope,
          part: e.dataset?.part,
          rect: [r.x, r.y, r.width, r.height],
          style: Object.fromEntries(props.map((p) => [p, cs[p]])),
          fill: cs.getPropertyValue('--_fill'),
          a: cs.getPropertyValue('--_a'),
          states: [':hover', ':active', ':focus', ':focus-visible'].filter((q) => e.matches(q)),
        }
      }
      const el = document.querySelector(css),
        chain = []
      for (let e = el; e; e = e.parentElement) chain.push(read(e))
      const under = document
        .elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        .map((e) => `${e.tagName.toLowerCase()}[${e.dataset?.part ?? e.dataset?.scope ?? ''}]`)
      return {
        chain,
        kids: [...el.children].map(read),
        html: el.outerHTML.slice(0, 600),
        under,
        scroll: [scrollX, scrollY],
        viewport: [innerWidth, innerHeight],
        active: document.activeElement?.tagName,
        activePart: document.activeElement?.textContent?.slice(0, 30),
        animations: document.getAnimations().map((a) => ({
          name: a.animationName ?? a.transitionProperty,
          state: a.playState,
          time: a.currentTime,
          target: a.effect?.target?.tagName,
          part: a.effect?.target?.dataset?.part,
          scope: a.effect?.target?.dataset?.scope,
          pseudo: a.effect?.pseudoElement,
        })),
      }
    },
    { css: sel, box: info.box },
  )
  const whole = await page.screenshot({ animations: 'disabled' })
  return { state, whole, info, url: page.url() }
}
let kept = 0
function keepEvidence(moment, reading) {
  const dir = process.env.A11Y_EVIDENCE,
    n = `${process.pid}-${kept++}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${n}.png`), moment.whole)
  writeFileSync(join(dir, `${n}-box.png`), reading.png)
  writeFileSync(
    join(dir, `${n}.json`),
    JSON.stringify(
      { ...moment, whole: undefined, reading: { ...reading, png: undefined } },
      null,
      1,
    ),
  )
}

/**
 * WCAG contrast of the text in `[data-a11y-px=i]`, measured: the text's own colour (resolved through a canvas, so
 * oklch and color-mix work, times every ancestor's opacity) over the backgrounds actually painted under its text box
 * (a screenshot with the text made transparent), unless an overlay or scrim covers it. Every background covering ≥ 10% of the box counts; the worst wins.
 */
export async function pixelContrast(page, i, tries = 4) {
  const sel = `[data-a11y-px="${i}"]`
  const info = await page.evaluate(textInfo, sel)
  if (!info || info.a < 0.05) return null
  if (await clippedAway(page, sel, info.box)) return null
  // what passes over or beside text without being behind it: the now line, peers' cursors and flags, a plan's radio dot
  const passing = `[data-scope="calendar"] [data-part="now"], [data-scope="cursor"]:not(:has(${sel})), [data-peer-selection]::before, [data-scope="plan-card"] [data-part="radio"] { visibility: hidden !important; } [data-peer-selection] { outline-color: transparent !important; }`
  const hide = await page.addStyleTag({
    content: `${sel}, ${sel} * { color: transparent !important; fill: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } ${passing}`,
  })
  // the inner box: a pill's round corners show what's behind the pill, which is not behind the text
  const { x, y, width, height } = info.box
  const png = await page.screenshot({
    clip: { x: x + width * 0.2, y: y + height * 0.2, width: width * 0.6, height: height * 0.6 },
    animations: 'disabled',
  })
  // a timer can reflow the page after the box was read (a rate limit's banner ending): those pixels are some other
  // part of the page, so they say nothing about this text. Read it again where it is now; never settling is a failure.
  const moved = await page.evaluate(
    ({ css, at }) => {
      const r = document.querySelector(css)?.getBoundingClientRect()
      return !r || [r.x, r.y, r.width, r.height].some((v, k) => Math.abs(v - at[k]) > 0.5)
    },
    { css: sel, at: info.at },
  )
  if (moved) {
    await hide.evaluate((n) => n.remove())
    if (tries > 1) return pixelContrast(page, i, tries - 1)
    throw new Error(`${info.where} kept moving while its contrast was measured`)
  }
  // A11Y_EVIDENCE=<dir>: what the page was at this moment, with the mask still on, kept only if the reading fails
  const moment = process.env.A11Y_EVIDENCE && (await evidence(page, sel, info))
  await hide.evaluate((n) => n.remove())
  const bgs = await page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const cx = Object.assign(document.createElement('canvas'), {
      width: img.width,
      height: img.height,
    }).getContext('2d')
    cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, img.width, img.height).data
    const count = new Map()
    for (let p = 0; p < d.length; p += 4) {
      const k = `${d[p]},${d[p + 1]},${d[p + 2]}`
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    const total = d.length / 4
    return [...count].filter(([, n]) => n / total >= 0.1).map(([k]) => k.split(',').map(Number))
  }, png.toString('base64'))
  const need = info.large ? 3 : 4.5
  let worst = null
  for (const bg of bgs) {
    const fg = info.fg.map((v, k) => v * info.a + bg[k] * (1 - info.a))
    const r = ratio(fg, bg)
    if (!worst || r < worst.ratio) worst = { ratio: r, fg: hex(fg), bg: hex(bg) }
  }
  if (!worst) return null
  if (moment && worst.ratio < need) keepEvidence(moment, { ...worst, need, png })
  return {
    where: info.where,
    ok: worst.ratio >= need,
    ratio: Math.round(worst.ratio * 100) / 100,
    need,
    fg: worst.fg,
    bg: worst.bg,
  }
}

const textInfo = async (css) => {
  const el = document.querySelector(css)
  if (!el) return null
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  // the scroll re-places an anchored panel on its next event: measure where the text ends up
  await new Promise((r) => {
    requestAnimationFrame(() => requestAnimationFrame(r))
  })
  const range = document.createRange()
  range.selectNodeContents(el)
  // clipped to the element: a visually hidden child's text is measured at full width but never painted
  const own = el.getBoundingClientRect(),
    all = range.getBoundingClientRect()
  const left = Math.max(all.left, own.left),
    right = Math.min(all.right, own.right)
  const box = own.width ? { x: left, y: all.y, width: right - left, height: all.height } : all
  if (box.width < 1 || box.height < 1) return null
  // covered by an overlay in the top layer (an open tooltip over the text above its trigger): not this text's contrast
  const top = document
    .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    ?.closest('[popover], dialog, [data-part="scrim"], [data-scope="save-bar"]')
  if (top && !top.contains(el)) return null
  const cs = getComputedStyle(el)
  let alpha = 1
  for (let e = el; e; e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity)
  const cx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext(
    '2d',
  )
  // SVG text paints with fill, not color
  cx.fillStyle = el instanceof SVGElement ? cs.fill : cs.color
  cx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data
  const size = parseFloat(cs.fontSize),
    bold = Number(cs.fontWeight) >= 700
  const where = `${el.closest('[data-scope]')?.dataset.scope ?? el.tagName.toLowerCase()}/${el.dataset.part ?? el.tagName.toLowerCase()}`
  return {
    where,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    at: [own.x, own.y, own.width, own.height],
    fg: [r, g, b],
    a: (a / 255) * alpha,
    large: size >= 24 || (bold && size >= 18.66),
  }
}
