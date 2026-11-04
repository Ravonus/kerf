import { onMount, state, stats } from '@weft-js/core'

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

/**
 * What this page cost, read from the browser: bytes from Resource Timing (as they came over the wire), DOM writes from a
 * MutationObserver on the document, and reactive runs from weft's own counter. Its own text doesn't count.
 */
export function Readout() {
  const js = state(0)
  const css = state(0)
  const html = state(0)
  const writes = state(0)
  const runs = state(0)
  let self: HTMLElement | undefined
  let held = 0
  onMount(() => {
    const add = (list: PerformanceEntryList) => {
      for (const e of list as PerformanceResourceTiming[]) {
        const size = e.encodedBodySize || 0
        if (e.entryType === 'navigation') html.value += size
        else if (
          e.initiatorType === 'script' ||
          (e.initiatorType === 'link' && /\.js(\?|$)/.test(e.name)) ||
          /\.js(\?|$)/.test(e.name)
        )
          js.value += size
        else if (/\.css(\?|$)/.test(e.name)) css.value += size
      }
    }
    held = stats.runs // the readout's own updates are held out of the count below
    add(performance.getEntriesByType('navigation'))
    const resources = new PerformanceObserver((l) => add(l.getEntries()))
    resources.observe({ type: 'resource', buffered: true })
    const dom = new MutationObserver((records) => {
      let n = 0
      for (const r of records)
        if (!self?.contains(r.target))
          n += r.type === 'childList' ? r.addedNodes.length + r.removedNodes.length : 1
      if (!n) return // its own text: reading the counter here would feed it
      writes.value += n
      runs.value = stats.runs - held
    })
    // After hydration's own cleanup, which drops the server's markers on the next task: this counts what the page does.
    const start = setTimeout(
      () =>
        dom.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        }),
      50,
    )
    return () => {
      clearTimeout(start)
      resources.disconnect()
      dom.disconnect()
    }
  })
  return (
    <p
      data-site="readout"
      ref={(el) => (self = el)}
      title="Bytes from Resource Timing, DOM writes from a MutationObserver, runs from weft's counter. Live, for this tab."
    >
      <span>This page</span>
      <span>
        <b>{kb(js.value)}</b> JS
      </span>
      <span>
        <b>{kb(css.value)}</b> CSS
      </span>
      <span>
        <b>{kb(html.value)}</b> HTML
      </span>
      <span>
        <b>{writes.value}</b> DOM writes
      </span>
      <span>
        <b>{runs.value}</b> reactive runs
      </span>
    </p>
  )
}
