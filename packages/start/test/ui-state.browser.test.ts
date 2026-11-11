import {
  registerSamePageOneBoxBothPanesNo,
  registerAcrossTabsASiblingLightsMarkedRemote,
  registerAcrossClientsARealSocketALate,
  registerAClosedLeaderHandsOverOneNew,
  registerKillingTheLeaderMidHoverNoStuck,
  registerAFollowerThatDiesMidHoverClears,
  registerAnElementRemovedUnderThePointerLets,
  registerANavigationAwayMidHoverClearsThe,
  registerNoEchoOneHoverInOneHover,
  registerALocalEffectNeverRunsForA,
  registerTouchATapLeavesHoverFalseHere,
  registerOfflineWithACloseEventThatNever,
} from './ui-state.pointer.mjs'
import {
  registerOfflineByTheBrowserItself,
  registerNoWebLocksOneSocketPerTab,
  registerAStuckLeaderATabThatGets,
  registerASweepAcrossRowsStaysUnderThe,
  registerBfcacheBackToAPageThatLeft,
  registerARowJoinIsAFrameNot,
  registerAKeyTheServerRefusesStaysIn,
  registerAKilledSocketReconnectsStateComesBack,
  registerNoRowsLeftNoSocketRowsAgain,
  registerATabOpenedLateSeesWhatThe,
  registerHighFrequencyHoverThrottledLatestValueKept,
} from './ui-state.resilience.mjs'
import {
  registerLatencyPerRouteAndSocketsPerClient,
  registerTabsWithShareChannelAndLiveOne,
  registerTheLeaderClosesOneNewSocketAnd,
  registerTheSocketDiesChannelAndLiveReconnect,
  registerATabThatClosesTakesItsLines,
  registerATabHiddenPastTheParkLimit,
  registerATabSignsInAfterTheSocket,
  registerLatencyOfLiveAndChannelSenderAnd,
} from './ui-state.measurements.mjs'
// Research 45: shared UI state in a real browser. Real pointer, real tabs, real sockets, real locks.
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { inject } from 'vitest'
import type * as Playwright from 'playwright-core'
import { box, lit, sleep } from './ui-state.helpers.mjs'

declare global {
  interface Window {
    __t0: number[]
    __t1: number[]
    __armed: boolean
    __watching: boolean
  }
}

const url = inject('url')
const engines = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const engine = (process.env.UI_STATE_BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit'
const onlyChromium = engine === 'chromium' ? test : test.skip // CDP
const shots = process.env.UI_STATE_SHOTS
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await engines[engine].launch()
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => {
  await browser?.close()
})
// A failed test mustn't leave a client hovering: the server and the keys are shared.
afterEach(async () => {
  await Promise.all(browser.contexts().map((c) => c.close().catch(() => {})))
  await sleep(100)
})

async function open(context: Playwright.BrowserContext, path = '/ui-state', init?: () => void) {
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    const Real = window.WebSocket
    window.__sockets = []
    window.WebSocket = class extends Real {
      constructor(u: string | URL, ...a: [protocols?: string | string[]]) {
        super(u, ...a)
        if (String(u).includes('/_kerf/ws')) window.__sockets.push(this)
      }
    }
  })
  if (init) await page.addInitScript(init)
  await page.goto(url + path)
  await page.waitForFunction(() => window.__kerf?.hydrated, null, { timeout: 15_000 })
  Object.assign(page, { errors })
  return page as Playwright.Page & { errors: string[] }
}

const shot = async (page: Playwright.Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` })
}

registerSamePageOneBoxBothPanesNo(() => browser, open, shot)

registerAcrossTabsASiblingLightsMarkedRemote(() => browser, open, shot)

registerAcrossClientsARealSocketALate(() => browser, open, shot)

registerAClosedLeaderHandsOverOneNew(() => browser, open)

registerKillingTheLeaderMidHoverNoStuck(() => browser, open, onlyChromium)

registerAFollowerThatDiesMidHoverClears(() => browser, open)

registerAnElementRemovedUnderThePointerLets(() => browser, open)

registerANavigationAwayMidHoverClearsThe(() => browser, open, url)

registerNoEchoOneHoverInOneHover(() => browser, open)

registerALocalEffectNeverRunsForA(() => browser, open)

registerTouchATapLeavesHoverFalseHere(() => browser, open)

// Playwright's WebKit keeps `navigator.onLine` true under `setOffline` and lets a new socket straight back in, so there
// the network never really goes. This goes offline the way a phone does in every engine: `onLine` false, an `offline`
// event, and a socket whose close event doesn't come, which is what WebKit's do.
registerOfflineWithACloseEventThatNever(() => browser, open)

registerOfflineByTheBrowserItself(() => browser, open, onlyChromium)

registerNoWebLocksOneSocketPerTab(() => browser, open)

// CDP's frozen state doesn't take on a visible headless page, so this leader's main thread is simply stuck: same symptom.
registerAStuckLeaderATabThatGets(() => browser, open)

registerASweepAcrossRowsStaysUnderThe(() => browser, open)

// Playwright turns bfcache off, so this browser turns it back on. Whether Chrome keeps a page is logged, not asserted:
// on a dev server it also depends on the HMR socket.
registerBfcacheBackToAPageThatLeft(() => browser, open, onlyChromium, engines, url)

registerARowJoinIsAFrameNot(() => browser, open)

registerAKeyTheServerRefusesStaysIn(() => browser, open)

registerAKilledSocketReconnectsStateComesBack(() => browser, open)

registerNoRowsLeftNoSocketRowsAgain(() => browser, open)

registerATabOpenedLateSeesWhatThe(() => browser, open)

registerHighFrequencyHoverThrottledLatestValueKept(() => browser, open)

// ---- measurements: `UI_STATE_MEASURE=<file>` -----------------------------------------------------------------------

// Date.now on both sides: it is the one clock two renderers share, to 1 ms. `timeOrigin` differs per process.
const arm = (from: Playwright.Page, to: Playwright.Page, name = 'Ana') =>
  Promise.all([
    from.evaluate(() => {
      window.__t0 = []
      if (window.__armed) return
      window.__armed = true
      document.addEventListener(
        'pointerover',
        (e) => {
          if ((e.target as Element).closest?.('[data-testid="left-Ana"] label'))
            window.__t0.push(Date.now())
        },
        { capture: true },
      )
    }),
    to.evaluate((n) => {
      window.__t1 = []
      if (window.__watching) return
      window.__watching = true
      const el = document.querySelector(`[data-testid="right-${n}"] label`)!
      new MutationObserver(() => {
        if (el.hasAttribute('data-hold')) window.__t1.push(Date.now())
      }).observe(el, { attributes: true, attributeFilter: ['data-hold'] })
    }, name),
  ])

async function measure(from: Playwright.Page, to: Playwright.Page, runs = 40) {
  await arm(from, to)
  const at = (await box(from, 'left', 'Ana').boundingBox())!
  const out = []
  for (let i = 0; i < runs; i++) {
    await from.mouse.move(at.x + 8, at.y + 8)
    await lit(box(to, 'right', 'Ana'))
    await sleep(120)
    await from.mouse.move(2, 2)
    await lit(box(to, 'right', 'Ana'), false)
    await sleep(120)
  }
  const a = await from.evaluate(() => window.__t0),
    b = await to.evaluate(() => window.__t1)
  for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(b[i]! - a[i]!)
  return out.sort((x, y) => x - y)
}
const q = (v: number[], p: number) =>
  +v[Math.min(v.length - 1, Math.floor(v.length * p))]!.toFixed(2)

registerLatencyPerRouteAndSocketsPerClient(() => browser, open, measure, q)

// ---- one browser, one socket: share, channel and live on the leader's link ---------------------------------------------

const label = (page: Playwright.Page, name: string) => page.getByLabel(name, { exact: true })
const socketsOpen = (pages: Playwright.Page[]) =>
  Promise.all(
    pages.map((p) => p.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length)),
  ).then((n) => n.reduce((a, b) => a + b, 0))
async function together(ctx: Playwright.BrowserContext, n: number) {
  const pages = []
  for (let i = 0; i < n; i++) pages.push(await open(ctx, '/together'))
  await Promise.all(
    pages.map(async (p) => {
      await expect.poll(() => label(p, 'status').textContent(), { timeout: 15_000 }).toBe('live')
      await expect.poll(() => label(p, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
    }),
  )
  return pages
}
const hitsOf = async (p: Playwright.Page) => +(await label(p, 'hits').textContent())!
const say = async (p: Playwright.Page, text: string) => {
  await label(p, 'draft').fill(text)
  await p.getByRole('button', { name: 'send', exact: true }).click()
}
const heard = async (p: Playwright.Page, text: string) => {
  await expect.poll(() => label(p, 'said').textContent(), { timeout: 10_000 }).toContain(text)
}

registerTabsWithShareChannelAndLiveOne(() => browser, {
  together,
  label,
  socketsOpen,
  hitsOf,
  say,
  heard,
})

registerTheLeaderClosesOneNewSocketAnd(() => browser, {
  together,
  label,
  socketsOpen,
  hitsOf,
  say,
  heard,
})

registerTheSocketDiesChannelAndLiveReconnect(() => browser, {
  together,
  label,
  socketsOpen,
  say,
  heard,
})

registerATabThatClosesTakesItsLines(() => browser, together, socketsOpen, say, heard)

registerATabHiddenPastTheParkLimit(() => browser, open, label)

registerATabSignsInAfterTheSocket(() => browser, { open, together, label, socketsOpen, url })

const measuring = process.env.TOGETHER_MEASURE ? test : test.skip
registerLatencyOfLiveAndChannelSenderAnd(() => browser, together, socketsOpen, measuring)
