// Installed before any page script. Clicks the probe element every frame until the watched markup answers: the first moment
// a visitor's tap would have worked, the same way for every framework. Pages with no probe report when long tasks stopped.
const PROBE = ({ click, watch }) => {
  window.__bench = { hydrated: null, tasks: 0 }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__bench.tasks = Math.max(window.__bench.tasks, e.startTime + e.duration)
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  if (!click) return
  const tick = () => {
    const el = document.querySelector(click),
      w = document.querySelector(watch ?? click)
    if (!el || !w) return requestAnimationFrame(tick)
    const before = w.outerHTML
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    requestAnimationFrame(() => {
      if (w.isConnected && w.outerHTML === before) return tick()
      window.__bench.hydrated = performance.now()
    })
  }
  requestAnimationFrame(tick)
}

const domCounts = (page) =>
  page.evaluate(() => {
    const w = document.createTreeWalker(
        document,
        NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      ),
      c = { 1: 0, 3: 0, 8: 0 }
    while (w.nextNode()) c[w.currentNode.nodeType]++
    return {
      ...window.__bench,
      dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
      elements: c[1],
      text: c[3],
      comments: c[8],
    }
  })

async function heapMetrics(cdp) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await cdp.send('HeapProfiler.collectGarbage')
  return Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
  )
}

/** 4x CPU throttle on a phone-sized context: time until interactive, main-thread script, and what's left in memory. */
export async function hydrationPass(browser, url, probe, { cookies = [] } = {}) {
  const ctx = await browser.newContext({
      viewport: { width: 412, height: 823 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await ctx.newPage()
  await ctx.addCookies(cookies)
  const cdp = await ctx.newCDPSession(page),
    errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(PROBE, probe ?? {})
  await page.goto(url, { waitUntil: 'load' })
  if (probe?.click)
    await page
      .waitForFunction(() => window.__bench.hydrated !== null, null, { timeout: 15000 })
      .catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
  const b = await domCounts(page)
  const m = await heapMetrics(cdp)
  await ctx.close()
  const method = probe?.click ? (b.hydrated === null ? 'probe-failed' : 'probe') : 'long-tasks'
  return {
    hydrate: b.hydrated ?? Math.max(b.tasks, b.dcl ?? 0),
    method,
    script: m.ScriptDuration * 1000,
    heap: m.JSHeapUsedSize / 1048576,
    nodes: m.Nodes,
    elements: b.elements,
    text: b.text,
    comments: b.comments,
    errors,
  }
}
