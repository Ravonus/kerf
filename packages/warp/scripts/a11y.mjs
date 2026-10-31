// The a11y suite: axe-core (WCAG 2.0–2.2 A/AA + best practice, color-contrast included) in Chromium at every dial
// stop, expression quiet/balanced/vivid × theme light/dark × motion full/reduce, over each site's interaction states.
// At motion "reduce" it also fails any loop still running that moves anything but opacity (00 §8: under reduced motion
// every animation runs at most once and spinners become an opacity pulse).
//
// One WCAG exemption is applied to axe's color-contrast results: text inside a disabled control (03 §2: a disabled
// field is 50% opacity as a whole, hint and message included) is "part of an inactive user interface component"
// (1.4.3), which axe only knows for the control's own text.
//
//   node scripts/a11y.mjs                         the gallery (test/a11y: every component, fixtures/Variants.tsx)
//   node scripts/a11y.mjs shop=<dist dir> [--json] also a built v3 shop (evals/warp-exit.mjs builds and passes it)
//   node scripts/a11y.mjs --stop=quiet/dark/full   one stop, while fixing what it finds
//
// Exit 1 on any violation, page error or motion leak.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobs, pool } from '../../../scripts/jobs.mjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(pkg, 'package.json'))

export const STOPS = ['quiet', 'balanced', 'vivid'].flatMap(expression => ['light', 'dark'].flatMap(theme => ['full', 'reduce'].map(motion => ({ expression, theme, motion }))))
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/** Build the gallery page (test/a11y) into a temp dir; returns the dist dir. */
export async function buildGallery(outDir) {
  const { build } = await import('vite')
  const { default: weft } = await import('weft/vite')
  await build({ root: join(pkg, 'test', 'a11y'), base: './', logLevel: 'silent', plugins: [weft()], build: { outDir, emptyOutDir: true } })
  return outDir
}

// What each site does between audits. `audit(label)` runs axe on the page as it is.
const SCENARIOS = {
  async gallery(page, audit, url) {
    await page.goto(`${url}?part=static`)
    await settle(page)
    await audit('static')
    await page.getByRole('button', { name: 'Copy' }).focus()
    await audit('tooltip')
    await page.getByLabel('Name', { exact: true }).focus()
    await audit('focused field')
    await page.goto(`${url}?part=overlays`)
    await settle(page)
    await audit('modal + drawer open')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Plain' }).click()
    await audit('popover open')
    await page.goto(`${url}?part=toasts`)
    await settle(page)
    await audit('toasts')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=table`)
    await settle(page)
    await audit('tables')
    await page.getByRole('checkbox', { name: 'Select Apollo' }).check({ force: true })
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('row selected and open')
    await page.getByRole('button', { name: 'Columns' }).first().click()
    await audit('columns open')
    await page.keyboard.press('Escape')
    await page.getByRole('searchbox', { name: 'Filter projects' }).fill('zzz')
    await audit('filter, no match')
    await page.setViewportSize({ width: 800, height: 800 })
    await page.goto(`${url}?part=table`)
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('tablet, details open')
    await page.goto(`${url}?part=table&sheet`)
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('tablet, detail sheet')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(`${url}?part=table`)
    await settle(page)
    await audit('phone cards')
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('phone card, details open')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=shell`)
    await settle(page)
    await audit('desktop shell')
    await page.getByRole('button', { name: 'Account: Ana Ruiz' }).click()
    await audit('account menu')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await audit('collapsed sidebar')
    await page.setViewportSize({ width: 800, height: 800 })
    await page.reload()
    await settle(page)
    await audit('tablet rail')
    await page.getByRole('button', { name: 'Expand navigation' }).click()
    await audit('rail overlay')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.reload()
    await settle(page)
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight)) // nothing left under the sticky bottom bar
    await audit('phone bars')
    await page.getByRole('button', { name: 'More' }).click()
    await audit('more sheet')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=shell&focus`)
    await settle(page)
    await audit('focus shell')
  },
  async charts(page, audit, url) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=charts`)
    await settle(page)
    await audit('every form')
    await page.locator('[data-mark]').first().focus()
    await page.keyboard.press('ArrowRight')
    await audit('tooltip on a focused mark')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Table view' }).first().click()
    await audit('table view')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(`${url}?part=charts`)
    await settle(page)
    await audit('every form on a phone')
    await page.goto(`${url}?part=rich`)
    await settle(page)
    await audit('rich inputs')
    // each panel in turn: the date calendar, the range presets, a month grid, a search list
    for (const name of [/^Open calendar|^Choose date|calendar/i, /^Billing month/, /^Time zone/, /^Fiscal period/, /^Sprint/]) {
      const trigger = page.getByRole('button', { name }).first()
      await trigger.click()
      await settle(page)
      await audit(`panel ${name}`)
      await page.keyboard.press('Escape')
    }
    await page.getByRole('combobox', { name: 'Place of birth' }).fill('li')
    await page.getByRole('option').first().waitFor()
    await audit('combobox open')
  },
  async shop(page, audit, url) {
    await page.goto(url)
    await page.getByRole('button', { name: /^Add/ }).first().waitFor()
    await audit('products')
    await page.getByRole('button', { name: /^Add/ }).first().click()
    await page.getByRole('button', { name: /^Cart/ }).click()
    await audit('cart')
  },
}

const luminance = ([r, g, b]) => {
  const c = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const hex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * WCAG contrast of the text in `[data-a11y-px=i]`, measured: the text's own colour (resolved through a canvas, so
 * oklch and color-mix work, times every ancestor's opacity) over the backgrounds actually painted under its text box
 * (a screenshot with the text made transparent), unless an overlay or scrim covers it. Every background covering ≥ 10% of the box counts; the worst wins.
 */
async function pixelContrast(page, i) {
  const sel = `[data-a11y-px="${i}"]`
  const info = await page.evaluate(async sel => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    // the scroll re-places an anchored panel on its next event: measure where the text ends up
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const range = document.createRange()
    range.selectNodeContents(el)
    // clipped to the element: a visually hidden child's text is measured at full width but never painted
    const own = el.getBoundingClientRect(), all = range.getBoundingClientRect()
    const left = Math.max(all.left, own.left), right = Math.min(all.right, own.right)
    const box = own.width ? { x: left, y: all.y, width: right - left, height: all.height } : all
    if (box.width < 1 || box.height < 1) return null
    // covered by an overlay in the top layer (an open tooltip over the text above its trigger): not this text's contrast
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[popover], dialog, [data-part="scrim"]')
    if (top && !top.contains(el)) return null
    const cs = getComputedStyle(el)
    let alpha = 1
    for (let e = el; e; e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity)
    const cx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')
    // SVG text paints with fill, not color
    cx.fillStyle = el instanceof SVGElement ? cs.fill : cs.color
    cx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
    const where = `${el.closest('[data-scope]')?.dataset.scope ?? el.tagName.toLowerCase()}/${el.dataset.part ?? el.tagName.toLowerCase()}`
    return { where, box: { x: box.x, y: box.y, width: box.width, height: box.height }, fg: [r, g, b], a: (a / 255) * alpha, large: size >= 24 || (bold && size >= 18.66) }
  }, sel)
  if (!info || info.a < 0.05) return null
  const hide = await page.addStyleTag({ content: `${sel}, ${sel} * { color: transparent !important; fill: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }` })
  // the inner box: a pill's round corners show what's behind the pill, which is not behind the text
  const { x, y, width, height } = info.box
  const png = await page.screenshot({ clip: { x: x + width * 0.2, y: y + height * 0.2, width: width * 0.6, height: height * 0.6 }, animations: 'disabled' })
  await hide.evaluate(n => n.remove())
  const bgs = await page.evaluate(async b64 => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const cx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d')
    cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, img.width, img.height).data
    const count = new Map()
    for (let p = 0; p < d.length; p += 4) { const k = `${d[p]},${d[p + 1]},${d[p + 2]}`; count.set(k, (count.get(k) ?? 0) + 1) }
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
  return { where: info.where, ok: worst.ratio >= need, ratio: Math.round(worst.ratio * 100) / 100, need, fg: worst.fg, bg: worst.bg }
}

/**
 * Contrast failures that are in the spec's own CSS (docs/design/warp/tokens, split verbatim into ui-core/styles), so
 * warp can't fix them without changing the spec. They are reported, not failed; anything else fails. The spec's a11y
 * review names the class (reviews/03 m12: small text under 4.5:1, fix with the subtle or text tokens). Empty: the chip
 * and segmented counts (opacity .7/.8, 3.2:1 and 4.0:1 in light) were fixed in the spec on 2026-10-30.
 */
export const SPEC_FINDINGS = []
const known = (m, stop) => SPEC_FINDINGS.find(f => f.where === m.where && f.theme === stop.theme)

// let entry motion and sweeps finish (they are ≤ 600 ms at full motion)
const settle = page => page.waitForTimeout(700)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const serve = dir => new Promise(ok => {
  const s = createServer((q, r) => {
    let p = join(dir, decodeURIComponent(q.url.split('?')[0]))
    if (!existsSync(p) || p.endsWith('/')) p = join(dir, 'index.html')
    r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
    r.end(readFileSync(p))
  }).listen(0, '127.0.0.1', () => ok(s))
})

/** Run every site at every stop. `sites` is [{ name, dir }] with name a SCENARIOS key. */
export async function a11y(sites, { log = () => {}, only, workers = jobs() } = {}) {
  const { chromium } = require('playwright-core')
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
  // A browser per worker: runs share nothing, and each measures its contrasts one screenshot at a time.
  const browsers = []
  const servers = []
  try {
    const tasks = []
    for (const { name, dir } of sites) {
      const server = await serve(dir)
      servers.push(server)
      const url = `http://127.0.0.1:${server.address().port}/`
      for (const stop of only ? STOPS.filter(s => `${s.expression}/${s.theme}/${s.motion}` === only) : STOPS) tasks.push({ name, url, stop })
    }
    const pending = tasks.length
    log(`${pending} runs, ${Math.min(workers, pending)} at a time (--jobs or WEFT_JOBS sets this)`)
    const runs = await pool(tasks, workers, async ({ name, url, stop }) => {
      const browser = browsers.pop() ?? await chromium.launch()
      const context = await browser.newContext({ colorScheme: stop.theme, reducedMotion: stop.motion === 'reduce' ? 'reduce' : 'no-preference' })
      // the dials live on <html> before any script runs, as an app's server render puts them
      await context.addInitScript(s => {
        const set = () => Object.assign(document.documentElement.dataset, s)
        if (document.documentElement) set()
        else document.addEventListener('readystatechange', set, { once: true })
      }, stop)
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(String(e)))
      const states = []
      const audit = async label => {
        await settle(page)
        if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: axe })
        const res = await page.evaluate(async rules => {
          document.querySelectorAll('[data-a11y-px]').forEach(e => e.removeAttribute('data-a11y-px'))
          const r = await window.axe.run(document, { runOnly: rules, resultTypes: ['violations', 'incomplete'], elementRef: true })
          const inactive = n => n.element?.closest('[data-disabled], :disabled, [aria-disabled="true"]')
          const plain = v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target.join(' '), why: (n.any[0]?.message ?? n.failureSummary ?? '').slice(0, 200) })) })
          for (const v of r.violations) if (v.id === 'color-contrast') v.nodes = v.nodes.filter(n => !inactive(n))
          // the contrast axe couldn't decide (a pseudo-element or overlapping fill, short text): measured from pixels below
          const review = r.incomplete.filter(v => v.id === 'color-contrast').flatMap(v => v.nodes).filter(n => n.element && !inactive(n))
          review.forEach((n, i) => n.element.setAttribute('data-a11y-px', String(i)))
          return { violations: r.violations.filter(v => v.nodes.length).map(plain), incomplete: r.incomplete.map(plain), review: review.map(n => n.target.join(' ')) }
        }, RULES)
        // the page has settled: freeze transitions so hiding one text for its screenshot can't fade another's colour
        const frozen = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
        const measured = []
        for (const [i, target] of res.review.entries()) {
          const m = await pixelContrast(page, i)
          if (m) measured.push({ target, ...m })
        }
        await frozen.evaluate(n => n.remove())
        // at reduce, no loop may move anything but opacity
        const moving = stop.motion === 'reduce'
          ? await page.evaluate(() => document.getAnimations().filter(a => {
            if (a.playState !== 'running' || a.effect?.getComputedTiming().iterations <= 1) return false
            return a.effect.getKeyframes().some(k => Object.keys(k).some(p => !['offset', 'computedOffset', 'easing', 'composite', 'opacity'].includes(p)))
          }).map(a => `${a.animationName ?? 'animation'} on ${a.effect?.target?.tagName?.toLowerCase()}${a.effect?.target?.dataset?.scope ? `[${a.effect.target.dataset.scope}]` : ''}`))
          : []
        const failing = measured.filter(m => !m.ok && !known(m, stop))
        states.push({
          label,
          violations: [...res.violations, ...(failing.length ? [{ id: 'color-contrast (measured)', impact: 'serious', nodes: failing.map(m => ({ target: m.target, why: `${m.where} ${m.ratio}:1 (needs ${m.need}:1), text ${m.fg} on ${m.bg}` })) }] : [])],
          spec: measured.filter(m => !m.ok && known(m, stop)).map(m => ({ ...m, finding: known(m, stop).why })),
          measured,
          moving,
        })
      }
      try { await SCENARIOS[name](page, audit, url) } catch (e) { errors.push(`scenario: ${String(e).split('\n')[0]}`) }
      const run = { site: name, ...stop, errors, states }
      const bad = states.filter(s => s.violations.length || s.moving.length)
      log(`${name} ${stop.expression}/${stop.theme}/${stop.motion}: ${states.length} audits${bad.length || errors.length ? `, FAIL ${[...bad.map(s => `[${s.label}] ${[...s.violations.map(v => `${v.id}×${v.nodes.length}`), ...s.moving.map(m => `moving: ${m}`)].join(', ')}`), ...errors].join('; ')}` : ', clean'}`)
      await context.close()
      browsers.push(browser)
      return run
    })
    const audits = runs.reduce((n, r) => n + r.states.length, 0)
    const failed = runs.filter(r => r.errors.length || r.states.some(s => s.violations.length || s.moving.length))
    const spec = SPEC_FINDINGS.map(f => ({ ...f, stops: runs.filter(r => r.states.some(s => s.spec.some(m => m.where === f.where))).map(r => `${r.site}:${r.expression}/${r.theme}/${r.motion}`) })).filter(f => f.stops.length)
    return { ok: failed.length === 0, stops: STOPS.length, runs: runs.length, audits, failed: failed.length, measured: runs.reduce((n, r) => n + r.states.reduce((k, s) => k + s.measured.length, 0), 0), spec, results: runs }
  } finally {
    await Promise.all(browsers.map(b => b.close()))
    for (const server of servers) server.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const json = process.argv.includes('--json')
  const extra = process.argv.slice(2).filter(a => a.includes('=') && !a.startsWith('--')).map(a => { const [name, dir] = a.split('='); return { name, dir } })
  const gallery = await buildGallery(mkdtempSync(join(tmpdir(), 'warp-a11y-')))
  const r = await a11y([{ name: 'gallery', dir: gallery }, { name: 'charts', dir: gallery }, ...extra], { log: json ? () => {} : l => console.error(l), only: process.argv.find(a => a.startsWith('--stop='))?.slice(7) })
  if (json) console.log(JSON.stringify(r, null, 2))
  else {
    for (const f of r.spec) console.error(`spec finding ${f.where} (${f.theme}, ${f.stops.length} runs): ${f.why}`)
    console.error(`${r.runs} runs, ${r.audits} audits, ${r.measured} contrasts measured from pixels: ${r.ok ? 'all clean' : `${r.failed} runs failed`}`)
  }
  process.exit(r.ok ? 0 : 1)
}
