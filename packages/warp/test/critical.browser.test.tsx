// @vitest-environment node
// What a server page paints before its deferred sheets come: every box and computed style the same as with all of them.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetIds } from '@weft/ui-core'
import { renderToString } from 'weft/ssr'
import { LAYER_ORDER, pageStyles } from '../../start/src/inline.mjs'
import { parse, purge } from '../../weft/node/purge.mjs'
// @ts-expect-error: query imports (weft/vite)
import { Ordinary } from './fixtures/Ordinary.tsx?weft-ssr'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

const root = fileURLToPath(new URL('../../ui-core/styles/', import.meta.url))
const walk = (d: string): string[] => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.css') ? [join(d, f)] : []))
const files = ['warp.css', ...walk(root).map(f => f.slice(root.length)).filter(f => f !== 'warp.css').sort()]
const inline = Object.fromEntries(files.map(f => [`/${f}`, readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]))

const dump = () => {
  // Every run at its end, not wherever the clock caught it.
  for (const a of document.getAnimations()) { if (a.effect?.getComputedTiming().endTime === Infinity) a.cancel(); else a.finish() }
  const keyframes = new Set<string>()
  const walk = (rules: CSSRuleList) => { for (const r of rules as any) { if (r.type === CSSRule.KEYFRAMES_RULE) keyframes.add(r.name); else if (r.cssRules) walk(r.cssRules) } }
  for (const s of document.querySelectorAll('style')) walk(s.sheet!.cssRules)
  const style = (e: Element, pseudo?: string) => {
    const s = getComputedStyle(e, pseudo), o: Record<string, string> = {}
    for (const k of s) if (!k.startsWith('--')) o[k] = s.getPropertyValue(k)
    return o
  }
  const nodes = [...document.querySelectorAll('#app, #app *')].map(e => {
    const r = e.getBoundingClientRect()
    return { name: `${e.tagName}[${e.getAttribute('data-scope') ?? e.getAttribute('data-part') ?? ''}]`, box: { x: r.x, y: r.y, w: r.width, h: r.height }, own: style(e), before: style(e, '::before'), after: style(e, '::after') }
  })
  // A rule that names keyframes the first paint doesn't carry would differ only until the next run.
  const lost = nodes.flatMap(n => [n.own, n.before, n.after].flatMap(c => c['animation-name'].split(', '))).filter(n => n !== 'none' && !keyframes.has(n))
  return { lost, nodes }
}

let browser: any
beforeAll(async () => { browser = await chromium.launch() })
afterAll(() => browser?.close())

async function take(doc: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  // The deferred sheets never arrive.
  await page.route('**/*', (r: any) => (r.request().isNavigationRequest() ? r.fulfill({ contentType: 'text/html', body: doc }) : r.abort()))
  await page.goto('http://app.test/')
  const out = await page.evaluate(dump)
  await context.close()
  return out
}

describe.each([390, 1320])('at %i px', width => {
  test('the critical rules paint what all the rules paint', async () => {
    resetIds()
    const html = renderToString(() => Ordinary({}))
    expect(html).toContain('data-scope="checkbox"')
    const { head } = pageStyles({ inline, critical: { parse, purge } }, files.map(f => ({ href: `/${f}` })), html)
    expect(head).toContain('data-late')
    const page = (styles: string) => `<!doctype html><html><head>${styles}</head><body><div id="app">${html}</div></body></html>`
    const full = await take(page(`<style>${LAYER_ORDER}</style>${Object.values(inline).map(c => `<style>${c}</style>`).join('')}`), width)
    const first = await take(page(head.replace(/<script>[\s\S]*?<\/script>/g, '')), width)
    expect(first.lost).toEqual([])
    expect(first.nodes.length).toBe(full.nodes.length)
    const diffs: string[] = []
    full.nodes.forEach((a: any, i: number) => {
      const b = first.nodes[i]
      if (JSON.stringify(a.box) !== JSON.stringify(b.box)) diffs.push(`${a.name} box ${JSON.stringify(a.box)} -> ${JSON.stringify(b.box)}`)
      for (const part of ['own', 'before', 'after']) for (const k in a[part]) if (a[part][k] !== b[part][k]) diffs.push(`${a.name} ${part} ${k}: ${a[part][k]} -> ${b[part][k]}`)
    })
    expect(diffs.slice(0, 30)).toEqual([])
  })
})
