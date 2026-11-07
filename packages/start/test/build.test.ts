// `weft build` (research 25 §6): Vite + Nitro to `.output`, run as the production server it makes. Node end to end
// (pages, prerendered and on-demand cards, hydration in Chrome); Bun runs its build when `bun` is on PATH; Deno's
// build is checked to complete (no deno here).
import { freePort } from '../../../scripts/lib/helpers.mjs'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fnId, inlineSheets, sheetPieces } from '../src/vite.mjs'
import { INLINE_CSS_MAX } from '../src/inline.mjs'
import { fixture, site } from './dev-server.setup.mjs'

type Server = { url: string; stop: () => boolean }
type GetServer = () => Server
type ReadPage = (path: string) => Promise<{ html: string; res: Response }>
type Paint = (html: string) => string
type Open = (
  options?: Parameters<Playwright.Browser['newContext']>[0],
  hold?: (route: Playwright.Route) => Promise<void>,
) => Promise<{
  context: Playwright.BrowserContext
  tab: Playwright.Page
  vis: () => Promise<string>
}>
type Under = (
  policy: string,
  path: string,
) => Promise<{ tab: Playwright.Page; browser: Playwright.Browser }>
declare global {
  interface Window {
    seen: unknown
  }
}

// Each build runs in its own node process, as `weft build` does: Nitro's build stalls inside vitest's module runner.
function build({ preset, ...rest }: { preset: string; [key: string]: unknown }) {
  const opts = JSON.stringify({ ...rest, preset, logLevel: 'error' })
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'build-app.mjs'), opts], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (r.status !== 0) throw new Error(`${preset} build failed:\n${r.stderr}`)
}
const out = (preset: string) => join(fixture, `.output-test-${preset}`)

async function serve(cmd: string, entry: string) {
  const port = await freePort()
  const child = spawn(cmd, [entry], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: 'ignore',
  })
  // Poll the port: Nitro's logger is silent under vitest's NODE_ENV=test, so there is no "Listening" line to wait for.
  let exited
  child.on('exit', (code) => (exited = code))
  for (
    const t0 = Date.now();
    ;
    await new Promise((ok) => {
      setTimeout(ok, 100)
    })
  ) {
    if (exited !== undefined) throw new Error(`${cmd} exited with ${String(exited)}`)
    if (Date.now() - t0 > 20_000) throw new Error(`${cmd} did not listen on ${port}`)
    if (
      await fetch(`http://localhost:${port}/`).then(
        () => true,
        () => false,
      )
    )
      break
  }
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}

afterAll(() => {
  for (const p of ['node', 'bun', 'deno_server']) rmSync(out(p), { recursive: true, force: true })
})

function registerGateThePagePaintsWithoutTheSheetHolds(
  open: Open,
  geometry: (tab: Playwright.Page) => Promise<number[]>,
) {
  test('the page paints without the sheet, holds the gate with its room kept, and shows it when the sheet lands', async () => {
    const held: (() => void)[] = []
    const release = () => held.forEach((go) => go())
    const { context, tab, vis } = await open({}, async (r) => {
      await new Promise<void>((go) => {
        held.push(go)
      })
      await r.continue()
    })
    await tab.waitForTimeout(400)
    expect(await tab.locator('h1').isVisible()).toBe(true)
    expect(await vis()).toBe('hidden')
    const before = await geometry(tab)
    release()
    await tab.waitForFunction(
      () => getComputedStyle(document.getElementById('gated')!).visibility === 'visible',
    )
    expect(await geometry(tab)).toEqual(before)
    expect(await tab.locator('#gated').isVisible()).toBe(true)
    await context.close()
  })
}

function registerGateASheetThatNeverComesOrIs(open: Open) {
  test("a sheet that never comes, or is gone after a deploy, can't hide it for good", async () => {
    const { context, tab } = await open({}, (r) => r.fulfill({ status: 404, body: '' }))
    await tab.waitForFunction(
      () => getComputedStyle(document.getElementById('gated')!).visibility === 'visible',
      null,
      { timeout: 5000 },
    )
    await context.close()
  })
}

function registerGateWithNoScriptAtAllAndIn(open: Open) {
  test('with no script at all, and in the accessibility tree once shown', async () => {
    const { context, tab, vis } = await open({ javaScriptEnabled: false })
    await tab.waitForLoadState('load')
    await tab.waitForTimeout(100)
    expect(await tab.locator('#gated').isVisible()).toBe(true)
    expect(await tab.getByRole('complementary', { name: 'Gated' }).count()).toBe(1)
    void vis
    await context.close()
  })
}

function registerGateReducedMotionShowsItWithNoFade(open: Open) {
  test('reduced motion shows it with no fade', async () => {
    const { context, tab } = await open({ reducedMotion: 'reduce' })
    await tab.waitForLoadState('load')
    await tab.waitForFunction(
      () => getComputedStyle(document.getElementById('gated')!).visibility === 'visible',
    )
    expect(
      await tab.evaluate(() => getComputedStyle(document.getElementById('gated')!).animationName),
    ).toBe('none')
    await context.close()
  })
}

function registerGateAStreamedBoundaryWaitsForTheSheet(
  getBrowser: () => Playwright.Browser,
  getServer: GetServer,
) {
  test('a streamed Boundary waits for the sheet, and a client route change finds its styles', async () => {
    let release!: () => void
    const context = await getBrowser().newContext()
    const tab = await context.newPage()
    await tab.route('**/assets/sheet-*.css', async (r) => {
      await new Promise<void>((go) => {
        release = go
      })
      await r.continue()
    })
    await tab.goto(getServer().url + '/slow', { waitUntil: 'commit' })
    await tab.waitForSelector('.skeleton')
    await tab.waitForTimeout(1500)
    expect(await tab.locator('.stock').count()).toBe(0) // the server sent it, the parser is held at the link
    release()
    await tab.waitForSelector('.stock')
    await tab.unroute('**/assets/sheet-*.css')
    await tab.goto(getServer().url + '/gate', { waitUntil: 'load' })
    await tab.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
    await tab.click('a[href="/styled"]')
    await tab.waitForURL('**/styled')
    await tab.waitForSelector('.badge')
    await context.close()
  })
}

function registerStyleGates(getServer: GetServer) {
  // WebKit runs with WEFT_WEBKIT=1 (the release gate).
  const browsers = process.env.WEFT_WEBKIT
    ? (['chromium', 'firefox', 'webkit'] as const)
    : (['chromium', 'firefox'] as const)
  for (const name of browsers)
    describe(`style gate in ${name}`, () => {
      const pw = createRequire(import.meta.url)('playwright-core') as typeof Playwright
      let browser: Playwright.Browser
      beforeAll(async () => {
        browser = await pw[name].launch()
      })
      afterAll(async () => {
        await browser?.close()
      })

      const open: Open = async (options = {}, hold) => {
        const context = await browser.newContext(options)
        const tab = await context.newPage()
        if (hold) await tab.route('**/assets/sheet-*.css', hold)
        await tab.goto(getServer().url + '/gate', { waitUntil: 'commit' })
        await tab.waitForSelector('h1')
        return {
          context,
          tab,
          vis: () =>
            tab.evaluate(() => getComputedStyle(document.getElementById('gated')!).visibility),
        }
      }
      const geometry = (tab: Playwright.Page) =>
        tab.evaluate(() => {
          const r = document.getElementById('gated')!.getBoundingClientRect()
          return [r.top, r.height]
        })

      registerGateThePagePaintsWithoutTheSheetHolds(open, geometry)

      registerGateASheetThatNeverComesOrIs(open)

      registerGateWithNoScriptAtAllAndIn(open)

      registerGateReducedMotionShowsItWithNoFade(open)

      registerGateAStreamedBoundaryWaitsForTheSheet(() => browser, getServer)
    })
}

function registerBuildCardsForStaticRoutesAndPrerenderParams() {
  test('cards for static routes and `prerender` params are files in the output', () => {
    for (const f of ['index', 'about', 'users', 'slow', 'users/1'])
      expect(existsSync(join(out('node'), `public/_weft/og/${f}.png`))).toBe(true)
    expect(existsSync(join(out('node'), 'public/_weft/og/users/2.png'))).toBe(false) // param route without prerender: on demand
  })
}

function registerBuildAPageEveryTagHashedClientAssets(getServer: GetServer) {
  test('a page: every tag, hashed client assets, the status before the first byte', async () => {
    const res = await fetch(getServer().url + '/users/42')
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text.match(/ data-wm>/g)).toHaveLength(16)
    expect(text).toMatch(
      /<script type="module" src="\/assets\/entry\.client-[\w-]+\.js"><\/script>/,
    )
    expect(text).not.toContain('/@vite/client')
    expect((await fetch(getServer().url + '/users/999')).status).toBe(404)
    expect((await fetch(getServer().url + '/boom')).status).toBe(500)
  })
}

function registerBuildCardsPrerenderedAndOnDemandBothImmutable(getServer: GetServer) {
  test('cards: prerendered and on demand, both immutable', async () => {
    const pre = await fetch(getServer().url + '/_weft/og/users/1.png?v=anything')
    expect([pre.status, pre.headers.get('content-type'), pre.headers.get('cache-control')]).toEqual(
      [200, 'image/png', 'public, max-age=31536000, immutable'],
    )
    const page = await (await fetch(getServer().url + '/users/2')).text()
    const src = /og:image" content="https:\/\/acme\.dev([^"]+)"/.exec(page)![1]!
    const live = await fetch(getServer().url + src)
    expect([live.status, live.headers.get('cache-control')]).toEqual([
      200,
      'public, max-age=31536000, immutable',
    ])
    const stale = await fetch(getServer().url + '/_weft/og/users/2.png?v=old')
    expect(stale.headers.get('cache-control')).toBe('no-cache') // not the current hash: never cached as immutable
  })
}

function registerBuildAFormWorksWithoutJSAndAn(getServer: GetServer) {
  test('a form works without JS, and an upload reaches the media route', async () => {
    const id = (name: string, file: string) => fnId(name, file)
    const add = new URLSearchParams({
      $fn: id('addNote', 'src/server/forms.ts'),
      title: 'Built',
      qty: '2',
    })
    const refused = await fetch(getServer().url + '/notes', {
      method: 'POST',
      redirect: 'manual',
      body: add,
    })
    expect(refused.status).toBe(403) // no origin proof
    const done = await fetch(getServer().url + '/notes', {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: getServer().url },
      body: add,
    })
    expect([done.status, done.headers.get('location')]).toEqual([303, '/notes'])
    const sharp = createRequire(new URL('../../plugin-media/package.json', import.meta.url))(
      'sharp',
    )
    const file = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#468' },
    })
      .png()
      .toBuffer()
    const form = new FormData()
    form.set('$fn', id('setCover', 'src/server/forms.ts'))
    form.set('file', new File([file], 'built.png', { type: 'image/png' }))
    expect(
      (
        await fetch(getServer().url + '/cover', {
          method: 'POST',
          redirect: 'manual',
          headers: { origin: getServer().url },
          body: form,
        })
      ).status,
    ).toBe(303)
    const { v } = await (
      await fetch(`${getServer().url}/_weft/fn/${id('getCover', 'src/server/forms.ts')}`)
    ).json()
    const image = await fetch(getServer().url + v.src, { headers: { accept: 'image/avif' } })
    expect([
      image.status,
      image.headers.get('content-type'),
      image.headers.get('cache-control'),
    ]).toEqual([200, 'image/avif', 'public, max-age=31536000, immutable'])
  })
}

function registerBuildAPageCarriesTheFirstPaintOf(page: ReadPage, paint: Paint) {
  test("a page carries the first paint of what it rendered, and no other route's", async () => {
    const styled = paint((await page('/styled')).html)
    for (const rule of ['html{', '.root{', '.styled{', '.badge{']) expect(styled).toContain(rule)
    const about = paint((await page('/about')).html)
    expect(about).toContain('.root{')
    expect(about).not.toContain('.styled{')
    expect(about).not.toContain('.badge{')
    expect(paint((await page('/users/999')).html)).toContain('.not-found{')
  })
}

function registerBuildThePageSSheetsAreAtMost(getServer: GetServer, page: ReadPage) {
  test("the page's sheets are at most two links past the shell, with every rule it needs and no other route's, cached for good", async () => {
    const { html } = await page('/styled')
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).not.toMatch(/<link rel="stylesheet"/)
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]!)
    expect(links.length).toBeLessThanOrEqual(2)
    let css = ''
    for (const href of links) {
      expect(html.indexOf(`href="${href}"`)).toBeGreaterThan(html.indexOf('</head>'))
      const res = await fetch(getServer().url + href)
      expect(res.headers.get('cache-control')).toContain('immutable')
      css += await res.text()
    }
    for (const rule of ['.root{', '.styled{', '.badge{']) expect(css).toContain(rule)
    expect(css).not.toContain('.not-found{') // another route's
  })
}

function registerBuildAHitAndAMissAreThe(getServer: GetServer, page: ReadPage, paint: Paint) {
  test('a hit and a miss are the same bytes, and nothing varies on the visitor', async () => {
    const a = await page('/styled'),
      b = await page('/styled')
    const c = await fetch(getServer().url + '/styled', {
      headers: { cookie: 'theme=dark; session=x' },
    }).then((r) => r.text())
    expect(paint(a.html)).toBe(paint(b.html))
    expect(paint(c)).toBe(paint(a.html))
    expect(a.res.headers.get('vary') ?? '').not.toMatch(/cookie/i)
  })
}

function registerBuildAStreamedBoundaryComesAfterTheSheet(page: ReadPage) {
  test("a streamed Boundary comes after the sheet's link, with only the styles not yet sent", async () => {
    const { html } = await page('/slow')
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!)
    const link = html.indexOf('<link rel="stylesheet" href=')
    const swap = html.indexOf('<template')
    if (swap > 0) expect(link).toBeLessThan(swap)
    const seen = new Set()
    for (const css of styles)
      for (const rule of css.match(/[^{}]+\{[^{}]*\}/g) ?? []) {
        if (rule.startsWith('@') || rule.includes('--')) continue
        expect(seen.has(rule)).toBe(false)
        seen.add(rule)
      }
  })
}

function registerBuildInlineSheetsLeavesOutWhatWouldBreakIn() {
  test('inlineSheets leaves out what would break in a <style>, and what is too big to carry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weft-sheets-'))
    mkdirSync(join(dir, 'assets'))
    const sheets = {
      'ok.css': 'a{background:url(/assets/x.png)}',
      'data.css': 'a{background:url("data:image/svg+xml,%3Csvg filter=\'url(%23n)\'/%3E")}',
      'rel.css': 'a{background:url(x.png)}',
      'close.css': 'a{content:"</style>"}',
      'big.css': 'a{}'.repeat(INLINE_CSS_MAX),
    }
    for (const [name, css] of Object.entries(sheets)) writeFileSync(join(dir, 'assets', name), css)
    expect(Object.keys(inlineSheets(dir, '/')).sort()).toEqual([
      '/assets/data.css',
      '/assets/ok.css',
    ])
    rmSync(dir, { recursive: true, force: true })
  })
}

function registerBuildABoundaryChunkNeedingRulesTheHead(getServer: GetServer) {
  test('a Boundary chunk needing rules the head left out brings them, styled from the first frame it shows', async () => {
    const html = await (await fetch(getServer().url + '/stream-sheet')).text()
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('shell-card')
    expect(head).not.toContain('late-card')
    const body = html.slice(html.indexOf('</head>'))
    expect(/<style>[^<]*late-card[^<]*<\/style>[\s\S]*?<template>/.test(body)).toBe(true)
    expect(body).not.toMatch(/<link rel="stylesheet"[^>]*>\n<template>/) // a link would hold the chunk until it loaded

    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
    const browser = await chromium.launch()
    try {
      const tab = await browser.newPage()
      // The sheet is slow and the swap is not: whatever the page first shows has to be styled.
      await tab.route('**/*.css', async (route) => {
        await new Promise((ok) => {
          setTimeout(ok, 200)
        })
        await route.continue()
      })
      await tab.addInitScript(() => {
        new MutationObserver((_, o) => {
          const el = document.querySelector('[data-scope="late-card"]')
          if (el?.closest('#app')) {
            window.seen = getComputedStyle(el).color
            o.disconnect()
          }
        }).observe(document, { subtree: true, childList: true })
      })
      await tab.goto(getServer().url + '/stream-sheet')
      await tab.waitForSelector('#app [data-scope="late-card"]')
      expect(await tab.evaluate(() => window.seen)).toBe('rgb(1, 2, 3)')
    } finally {
      await browser.close()
    }
  }, 30_000)
}

function registerBuildARouteThatRenderedBeforeSendsIts(getServer: GetServer) {
  test('a route that rendered before sends its head first, and brings what this render reaches beyond it', async () => {
    const plain = await (await fetch(getServer().url + '/stream-sheet')).text()
    const again = await (await fetch(getServer().url + '/stream-sheet')).text()
    // The late card (40 ms) is inlined when a render is slow enough for it, and streamed after a skeleton when not:
    // a cold or busy server does the first, so what the boundary holds isn't compared.
    const app = (html: string) =>
      html
        .slice(
          html.indexOf('<div id="app">'),
          html.indexOf('<script type="application/json" id="weft-route">'),
        )
        .replace(/<!--\[-->[\s\S]*?<!--\]-->/, '<!--[--><!--]-->')
    expect(app(again)).toBe(app(plain))
    // With the build's first-paint table, a head sent first has only the layer order: the shell's rules come just before it.
    const head = again.slice(0, again.indexOf('<div id="app">'))
    expect(head).toContain('shell-card')
    expect(head.slice(0, head.indexOf('</head>'))).toMatch(
      /<link rel="modulepreload" href="\/assets\/entry\.client-[\w-]+\.js">/,
    )
    expect(head).not.toContain('extra-card')

    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
    const browser = await chromium.launch()
    try {
      const tab = await browser.newPage()
      await tab.route('**/*.css', async (route) => {
        await new Promise((ok) => {
          setTimeout(ok, 300)
        })
        await route.continue()
      })
      await tab.addInitScript(() => {
        new MutationObserver((_, o) => {
          const el = document.querySelector('[data-scope="extra-card"]')
          if (el) {
            window.seen = getComputedStyle(el).color
            o.disconnect()
          }
        }).observe(document, { subtree: true, childList: true })
      })
      await tab.goto(getServer().url + '/stream-sheet?x')
      await tab.waitForSelector('#app [data-scope="late-card"]')
      expect(await tab.evaluate(() => window.seen)).toBe('rgb(7, 8, 9)') // styled from the first frame, with the sheet still out
      await tab.waitForFunction(() => window.__weft?.hydrated)
      expect(await tab.evaluate(() => window.__weft)).toMatchObject({ misses: 0, hydrated: true })
    } finally {
      await browser.close()
    }
  }, 30_000)
}

function registerBuildACSPThatRefusesInlineScriptsStill(getServer: GetServer, under: Under) {
  test('a CSP that refuses inline scripts still gets every deferred sheet', async () => {
    // Deferred (`media="print"`) sheets are `criticalCss: false`'s; with the first-paint table they're plain links past the shell.
    const { tab, browser } = await under("script-src 'self'", '/late-css')
    try {
      await tab.goto(getServer().url + '/late-css')
      await tab.waitForFunction(() => !document.querySelector('link[media="print"]'), undefined, {
        timeout: 5000,
      })
      await tab.hover('#late')
      expect(await tab.$eval('#late', (n) => getComputedStyle(n).color)).toBe('rgb(4, 5, 6)')
    } finally {
      await browser.close()
    }
  }, 30_000)
}

function registerBuildACSPThatRefusesInlineStylesStill(getServer: GetServer, under: Under) {
  test('a CSP that refuses inline styles still gets the sheets of a page that inlined them whole', async () => {
    const { tab, browser } = await under("style-src 'self'", '/styled')
    try {
      await tab.goto(getServer().url + '/styled')
      await tab.waitForFunction(() => !document.querySelector('style+link[disabled]'), undefined, {
        timeout: 5000,
      })
      await tab.waitForFunction(
        () =>
          [...document.querySelectorAll('link[rel=stylesheet]:not([disabled])')].every(
            (l) => (l as HTMLLinkElement).sheet,
          ),
        undefined,
        { timeout: 5000 },
      )
      expect(await tab.$eval('.styled', (n) => getComputedStyle(n).color)).toBe('rgb(1, 2, 3)')
    } finally {
      await browser.close()
    }
  }, 30_000)
}

function registerBuildAnIslandThatWakesOnSightWakes(getServer: GetServer) {
  test('an island that wakes on sight wakes when a chunk replaces the fallback watching for it', async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
    const browser = await chromium.launch()
    try {
      for (const path of ['/held-island', '/held-island?boot']) {
        const tab = await browser.newPage()
        await tab.goto(getServer().url + path, { waitUntil: 'commit' })
        await tab.waitForSelector('.wait-awake', { state: 'attached' }) // what the observers have, once the entry's run
        await tab.waitForSelector('.awake')
        await tab.waitForFunction(
          () => !document.querySelector('.awake')!.hasAttribute('wk'),
          null,
          { timeout: 5000 },
        ) // claimed
        await tab.close()
      }
    } finally {
      await browser.close()
    }
  }, 30_000)
}

function registerBuildTheHeadAsksForTheEntryOnce(getServer: GetServer) {
  test('the head asks for the entry once: its script tag, or a preload when the tag is in the body', async () => {
    for (let i = 0; i < 2; i++) {
      // the second request's head goes out before the page renders
      const [head, body] = (await (await fetch(getServer().url + '/about')).text()).split('</head>')
      const entry = /<script type="module" src="([^"]+)"/.exec(head! + body)![1]!
      const asks = [
        `<script type="module" src="${entry}"`,
        `<link rel="modulepreload" href="${entry}"`,
      ].filter((t) => head!.includes(t))
      expect(asks).toHaveLength(1)
      expect(body!.includes(`<script type="module" src="${entry}"`)).toBe(
        asks[0]!.startsWith('<link'),
      )
    }
  })
}

function registerBuildACombinedSheetStaysInTheBuild() {
  test('a combined sheet stays in the build for the window a page cached before the deploy needs it, and no longer', () => {
    const root = mkdtempSync(join(tmpdir(), 'weft-keep-'))
    const dir = join(root, 'out'),
      old = join(root, '.weft/sheets')
    mkdirSync(join(dir, 'assets'), { recursive: true })
    mkdirSync(old, { recursive: true })
    writeFileSync(join(dir, 'assets/a.css'), 'p{color:red}')
    writeFileSync(join(old, 'sheet-old.css'), 'p{color:blue}')
    writeFileSync(join(old, 'sheet-dead.css'), 'p{color:green}')
    utimesSync(join(old, 'sheet-dead.css'), new Date(0), new Date(0))
    sheetPieces(
      dir,
      '/',
      {
        shared: { file: 'assets/sheet-new.css', has: ['assets/a.css'] },
        routes: [],
        files: { 'assets/sheet-new.css': 'p{color:red}' },
      },
      [],
      root,
    )
    expect(existsSync(join(dir, 'assets/sheet-old.css'))).toBe(true)
    expect(existsSync(join(dir, 'assets/sheet-dead.css'))).toBe(false)
    expect(existsSync(join(old, 'sheet-dead.css'))).toBe(false)
    expect(existsSync(join(old, 'sheet-new.css'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
}

function registerBuildNoChunkCarriesZodASchemaOnly() {
  test('no chunk carries zod: a schema only `z.infer` reads stays on the server', () => {
    const dir = join(out('node'), 'public/assets')
    const js = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
    expect(js.join('\n')).toContain('save.') // the stub is there
    expect(js.join('\n')).not.toMatch(/ZodObject|ZodError/)
  })
}

function registerBuildTheProductionBuildHydratesWithInChrome(getServer: GetServer) {
  test('the production build hydrates with 0/0 in Chrome and navigates', async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
    const browser = await chromium.launch()
    try {
      const tab = await browser.newPage()
      await tab.goto(getServer().url + '/users/1')
      await tab.waitForFunction(() => window.__weft?.hydrated)
      expect(await tab.evaluate(() => window.__weft)).toEqual({
        misses: 0,
        writes: 0,
        hydrated: true,
      })
      await tab.click('a[href="/users/42"]')
      await tab.waitForFunction(() => document.querySelector('h2')?.textContent === 'Alan Turing')
      expect(await tab.title()).toBe('Alan Turing · Acme')
      // The client bundle carries no loader code: the fixture's db module (with its marker string) stays on the server.
      const js = await tab.evaluate(() =>
        Promise.all(
          performance
            .getEntriesByType('resource')
            .filter((e) => e.name.endsWith('.js'))
            .map((e) => fetch(e.name).then((r) => r.text())),
        ),
      )
      expect(js.join('\n')).not.toContain('db-secret-7f3a')
    } finally {
      await browser.close()
    }
  })
}

describe('node preset, end to end', () => {
  let server: Server
  beforeAll(async () => {
    build({ root: fixture, site, preset: 'node', nitro: { output: { dir: out('node') } } })
    server = await serve(process.execPath, join(out('node'), 'server/index.mjs'))
  }, 120_000)
  afterAll(() => server?.stop())

  registerBuildCardsForStaticRoutesAndPrerenderParams()

  registerBuildAPageEveryTagHashedClientAssets(() => server)

  registerBuildCardsPrerenderedAndOnDemandBothImmutable(() => server)

  registerBuildAFormWorksWithoutJSAndAn(() => server)

  const page = (path: string) =>
    fetch(server.url + path).then(async (r) => ({ html: await r.text(), res: r }))
  const paint = (html: string) =>
    [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).join('')

  registerBuildAPageCarriesTheFirstPaintOf(page, paint)

  registerBuildThePageSSheetsAreAtMost(() => server, page)

  registerBuildAHitAndAMissAreThe(() => server, page, paint)

  registerBuildAStreamedBoundaryComesAfterTheSheet(page)

  registerStyleGates(() => server)

  registerBuildInlineSheetsLeavesOutWhatWouldBreakIn()

  registerBuildABoundaryChunkNeedingRulesTheHead(() => server)

  registerBuildARouteThatRenderedBeforeSendsIts(() => server)

  /** The page with this policy on it, the document only, as a host would send it. */
  async function under(policy: string, path: string) {
    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
    const browser = await chromium.launch()
    const tab = await browser.newPage()
    await tab.route(
      (url) => url.pathname === path,
      async (route) => {
        const res = await route.fetch()
        await route.fulfill({
          response: res,
          headers: { ...res.headers(), 'content-security-policy': policy },
        })
      },
    )
    return { tab, browser }
  }

  registerBuildACSPThatRefusesInlineScriptsStill(() => server, under)

  registerBuildACSPThatRefusesInlineStylesStill(() => server, under)

  registerBuildAnIslandThatWakesOnSightWakes(() => server)

  registerBuildTheHeadAsksForTheEntryOnce(() => server)

  registerBuildACombinedSheetStaysInTheBuild()

  registerBuildNoChunkCarriesZodASchemaOnly()

  registerBuildTheProductionBuildHydratesWithInChrome(() => server)
})

test('bun preset builds and serves', async () => {
  build({ root: fixture, site, preset: 'bun', nitro: { output: { dir: out('bun') } } })
  expect(existsSync(join(out('bun'), 'server/index.mjs'))).toBe(true)
  if (spawnSync('bun', ['--version']).status !== 0) return
  const server = await serve('bun', join(out('bun'), 'server/index.mjs'))
  try {
    const res = await fetch(server.url + '/users/42')
    expect(res.status).toBe(200)
    expect((await res.text()).match(/ data-wm>/g)).toHaveLength(16)
    const card = await fetch(server.url + '/_weft/og/users/2.png')
    expect(card.headers.get('content-type')).toBe('image/png')
  } finally {
    server.stop()
  }
}, 120_000)

test('deno_server preset builds', () => {
  build({
    root: fixture,
    site,
    preset: 'deno_server',
    nitro: { output: { dir: out('deno_server') } },
  })
  const entry = readFileSync(join(out('deno_server'), 'server/index.mjs'), 'utf8')
  expect(entry).toMatch(/Deno\.serve|deno/i)
  expect(existsSync(join(out('deno_server'), 'public/_weft/og/users/1.png'))).toBe(true)
}, 120_000)
