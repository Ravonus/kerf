// The stack-neutral design audit behind `evals/ds-exit.mjs` (PLAN §9 Phase 4) and measure.mjs: it reads only the built
// page in Chromium, so it can't tell weft from React. Every screen of the brief, in light and dark, at 1280 and 390.
//
//   a11y         axe (WCAG 2.0–2.2 A/AA + best practice) nodes, split by contrast and everything else, over the resting
//                screens and two states (the invalid form, the open dialog); keyboard focus with no visible change;
//                sideways scroll at 390
//   consistency  distinct computed values across the screens, by kind, and "drift": how many different looks each role
//                (primary button, input, h1, h2, table row, nav link) has
//   brief        does the page do what the brief asked, by role and text only
//
// What it can't see: whether the page looks good (nothing here judges that), and contrast over images or gradients
// (axe marks those incomplete, and they aren't counted).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../../packages/warp/package.json'))
export const { chromium } = require('playwright-core')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const SCREENS = ['settings', 'customers', 'pricing']
const VIEWPORTS = [[1280, 800], [390, 780]]
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }

function serve(dir) {
  return new Promise(ok => {
    const s = createServer((req, res) => {
      const path = join(dir, new URL(req.url, 'http://x').pathname)
      const file = existsSync(path) && statSync(path).isFile() ? path : join(dir, 'index.html')
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    }).listen(0, '127.0.0.1', () => ok(s))
  })
}

const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 450))))

async function show(page, url, screen) {
  await page.goto(`${url}#/${screen}`)
  await page.waitForLoadState('load')
  await settle(page)
}

async function axe(page) {
  await page.evaluate(AXE)
  const r = await page.evaluate(rules => globalThis.axe.run(document, { runOnly: { type: 'tag', values: rules } }), RULES)
  return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(' ') }))
}

/** Tab through the page: a stop whose outline, shadow, border and background all stay as they were shows nothing. */
function focusLoss(page) {
  return page.evaluate(async () => {
    const look = el => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor, c.textDecorationLine].join('|') }
    const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(e => e.tabIndex >= 0 && e.offsetParent).slice(0, 25)
    const out = { stops: els.length, invisible: 0 }
    for (const el of els) {
      const rest = look(el)
      el.focus({ focusVisible: true })
      if (document.activeElement === el && look(el) === rest && look(el.parentElement ?? el) === look(el.parentElement ?? el)) {
        // Fields draw the ring on a wrapper (warp's sweep, shadcn's ring on a parent): check two ancestors while focused.
        const up = [el.parentElement, el.parentElement?.parentElement].filter(Boolean)
        const before = up.map(look)
        el.blur()
        const after = up.map(look)
        if (before.every((v, i) => v === after[i])) out.invisible++
      }
      el.blur()
    }
    return out
  })
}

/** Every visible element's computed values, as `kind → value → count`, plus each role's look. */
function collect(page) {
  return page.evaluate(() => {
    const values = {}, roles = {}
    const add = (kind, v) => { if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' && v !== 'auto') (values[kind] ??= {})[v] = ((values[kind] ??= {})[v] ?? 0) + 1 }
    const role = (name, el, c) => { (roles[name] ??= []).push([c.fontSize, c.fontWeight, c.borderRadius, c.minHeight === 'auto' ? '' : c.minHeight, Math.round(el.getBoundingClientRect().height), c.paddingLeft, c.backgroundColor, c.color].join(' ')) }
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName) || el.closest('svg') && el.tagName !== 'svg') continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const c = getComputedStyle(el)
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      if (hasText) {
        add('font-size', c.fontSize); add('font-weight', c.fontWeight); add('line-height', c.lineHeight); add('font-family', c.fontFamily); add('color', c.color)
      }
      add('background', c.backgroundColor)
      if (parseFloat(c.borderTopWidth)) add('border-color', c.borderTopColor)
      add('radius', c.borderTopLeftRadius); add('shadow', c.boxShadow)
      for (const p of ['paddingTop', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) add('spacing', c[p])
      const t = el.tagName.toLowerCase()
      if (/^h[12]$/.test(t)) role(t, el, c)
      if (t === 'button' || el.getAttribute('role') === 'button') role(parseFloat(c.backgroundColor.split(',')[3] ?? 1) > 0 && c.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'filled button' : 'quiet button', el, c)
      if (t === 'input' && !['checkbox', 'radio', 'hidden'].includes(el.type)) role('input', el, c)
      if (t === 'tr') role('table row', el, c)
      if (t === 'a' && el.closest('nav')) role('nav link', el, c)
    }
    return { values, roles }
  })
}

const merge = (into, from) => {
  for (const [k, vs] of Object.entries(from.values)) for (const [v, n] of Object.entries(vs)) (into.values[k] ??= {})[v] = (into.values[k][v] ?? 0) + n
  for (const [k, list] of Object.entries(from.roles)) (into.roles[k] ??= []).push(...list)
}

/** The brief, by role and text. Each is one point; a stack that fails one still gets audited. */
async function brief(page, url) {
  const out = {}
  const check = async (name, fn) => {
    try { out[name] = !!(await fn()) } catch { out[name] = false }
  }
  await show(page, url, 'settings')
  await check('three links in a nav', async () => { for (const n of ['Settings', 'Customers', 'Pricing']) await page.getByRole('navigation').getByRole('link', { name: n }).first().waitFor({ timeout: 1500 }); return true })
  await check('settings: h1', () => page.getByRole('heading', { level: 1 }).first().isVisible())
  await check('settings: fields by label', async () => { for (const n of ['Full name', 'Email', 'Bio']) await page.getByLabel(n).first().waitFor({ timeout: 1500 }); return true })
  await check('settings: Role select', () => page.getByLabel('Role').first().isVisible())
  await check('settings: bad email refused', async () => {
    await page.getByLabel('Email').first().fill('nope')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await settle(page)
    return page.getByText(/valid email/i).first().isVisible()
  })
  await check('settings: good save confirms', async () => {
    await page.getByLabel('Email').first().fill('ada@example.com')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await settle(page)
    return page.getByText(/saved/i).first().isVisible()
  })
  await show(page, url, 'customers')
  await check('customers: 12 rows', async () => (await page.getByRole('row').count()) >= 13)
  await check('customers: search narrows', async () => {
    await page.getByLabel(/search/i).first().fill('zzzz-no-match')
    await settle(page)
    const none = await page.getByText(/no customers/i).first().isVisible()
    await page.getByLabel(/search/i).first().fill('')
    await settle(page)
    return none
  })
  await check('customers: delete asks, then removes', async () => {
    await page.getByRole('button', { name: /delete/i }).first().click()
    await settle(page)
    const open = await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().isVisible()
    await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().getByRole('button', { name: /delete/i }).click()
    await settle(page)
    return open && (await page.getByRole('row').count()) >= 12 && (await page.getByRole('row').count()) < 13 + 0
  })
  await show(page, url, 'pricing')
  await check('pricing: three plans', async () => { for (const n of ['Starter', 'Team', 'Enterprise']) await page.getByRole('heading', { name: n }).first().waitFor({ timeout: 1500 }); return true })
  await check('pricing: FAQ', () => page.getByText(/frequently asked/i).first().isVisible())
  return out
}

/** Audit one built app. */
export async function audit(browser, dist) {
  const server = await serve(dist)
  const url = `http://127.0.0.1:${server.address().port}/`
  const out = { axe: 0, contrast: 0, serious: 0, byRule: {}, focusStops: 0, focusInvisible: 0, overflow: 0, darkFollows: 0, errors: [] }
  const collected = { values: {}, roles: {} }
  const count = violations => {
    for (const v of violations) {
      out.axe += v.nodes
      if (v.id === 'color-contrast') out.contrast += v.nodes
      if (v.impact === 'serious' || v.impact === 'critical') out.serious += v.nodes
      out.byRule[v.id] = (out.byRule[v.id] ?? 0) + v.nodes
    }
  }
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      page.on('pageerror', e => out.errors.push(String(e).slice(0, 160)))
      for (const screen of SCREENS) {
        await show(page, url, screen)
        count(await axe(page))
        if (width === 390 && (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))) out.overflow++
        if (width === 1280 && scheme === 'light') {
          const f = await focusLoss(page)
          out.focusStops += f.stops; out.focusInvisible += f.invisible
          merge(collected, await collect(page))
        }
        if (scheme === 'dark' && width === 1280) out.darkFollows += await page.evaluate(() => {
          const l = v => { const [r, g, b] = v.match(/[\d.]+/g).map(Number); return (r + g + b) / 3 }
          const paint = e => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c } return 'rgb(255, 255, 255)' }
          return l(paint(document.querySelector('main') ?? document.body)) < 110 ? 1 : 0
        })
      }
      // Two states the resting page doesn't show.
      try {
        await show(page, url, 'settings')
        await page.getByLabel('Email').first().fill('nope')
        await page.getByRole('button', { name: 'Save' }).first().click()
        await settle(page)
        count(await axe(page))
      } catch (e) { out.errors.push(`form state: ${String(e).slice(0, 100)}`) }
      try {
        await show(page, url, 'customers')
        await page.getByRole('button', { name: /delete/i }).first().click()
        await settle(page)
        count(await axe(page))
      } catch (e) { out.errors.push(`dialog state: ${String(e).slice(0, 100)}`) }
      await ctx.close()
    }
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  out.brief = await brief(page, url)
  await page.close()
  server.close()

  const distinct = Object.fromEntries(Object.entries(collected.values).map(([k, v]) => [k, Object.keys(v).length]))
  const drift = Object.fromEntries(Object.entries(collected.roles).map(([k, v]) => [k, new Set(v).size]))
  const a = {
    axe: out.axe, contrast: out.contrast, serious: out.serious, byRule: out.byRule, focusStops: out.focusStops, focusInvisible: out.focusInvisible, overflow: out.overflow,
    darkFollows: out.darkFollows, distinct, distinctTotal: Object.values(distinct).reduce((a, b) => a + b, 0), drift, driftTotal: Object.values(drift).reduce((a, b) => a + b, 0),
    brief: out.brief, briefPassed: Object.values(out.brief).filter(Boolean).length, briefTotal: Object.keys(out.brief).length, errors: [...new Set(out.errors)].slice(0, 5), bytes: bytes(dist),
  }
  return a
}

const br = b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
function bytes(dist) {
  const out = { js: 0, css: 0 }
  const walk = dir => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith('.js')) out.js += br(readFileSync(p))
      else if (f.name.endsWith('.css')) out.css += br(readFileSync(p))
    }
  }
  walk(dist)
  return out
}
