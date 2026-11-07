// This function runs in the page before the trusted input.
export function observeNavigation() {
  const main = document.querySelector('#content')
  const layout = document.querySelector('.site-head')
  const link = document.querySelector('.site-head a[href="/pricing"]')
  if (!main || !layout || !link) throw new Error('landing navigation elements missing')
  const original = main.firstElementChild
  const shifts = []
  const result = { input: null, response: null, skeleton: null, settled: false, shifts }
  const collect = (entries) => {
    for (const entry of entries) {
      shifts.push({
        time: entry.startTime,
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
      })
    }
  }
  const observer = new PerformanceObserver((list) => collect(list.getEntries()))
  observer.observe({ type: 'layout-shift', buffered: true })
  addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isTrusted || result.input !== null) return
      result.input = performance.now()
      requestAnimationFrame(sample)
    },
    { capture: true, once: true },
  )
  function sample() {
    const now = performance.now()
    const visible =
      main.getBoundingClientRect().height > 0 && getComputedStyle(main).visibility !== 'hidden'
    const style = getComputedStyle(link)
    const active =
      link.getAttribute('aria-current') === 'page' &&
      style.boxShadow !== 'none' &&
      link.getBoundingClientRect().width > 0
    const changed = main.firstElementChild !== original
    const real = main.textContent.includes('Simple pricing that grows with your team')
    if (result.response === null && location.pathname === '/pricing' && active && visible)
      result.response = now - result.input
    // A generated shape keeps the route's static text, so it is found by its inert wrapper, not by missing words.
    const shape = main.querySelector('[inert], [data-skeleton]')
    if (result.skeleton === null && visible && shape) result.skeleton = now - result.input
    if (real && changed && !shape) result.settled = true
    result.layout = document.querySelector('.site-head') === layout
    if (now - result.input < 5000) requestAnimationFrame(sample)
  }
  window.__navigation = {
    result,
    finish() {
      collect(observer.takeRecords())
      observer.disconnect()
      return result
    },
  }
}

export function assertNavigation(result) {
  if (result.input === null) throw new Error('no trusted pointerdown')
  if (result.response === null || result.response >= 50)
    throw new Error('painted response >= 50ms or missing')
  if (result.skeleton === null || result.skeleton >= 100)
    throw new Error('skeleton >= 100ms or missing')
  if (!result.layout) throw new Error('shared layout identity changed')
  if (!result.settled) throw new Error('destination did not settle')
  const value = result.shifts
    .filter((shift) => shift.time >= result.input + result.skeleton)
    .reduce((sum, shift) => sum + shift.value, 0)
  if (value !== 0) throw new Error(`layout shift ${value}, expected 0`)
}
