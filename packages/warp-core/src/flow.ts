let installed = false

/**
 * What warp.flow moves, read from the sheets: the rules that set `--_flow-r`, the reach each family's view() range reads.
 * The list lives in the CSS alone, so the fallback moves what the CSS moves, and the JS names no family: a name here is
 * a word in every build, and weft's purge would keep every family's rules and keyframes for it. Custom properties
 * survive a parser that can't read animation-timeline, and a sheet behind @supports is still in the CSSOM.
 */
function families(doc: Document) {
  const found: string[] = []
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
      if ('selectorText' in rule && (rule as CSSStyleRule).style.getPropertyValue('--_flow-r')) found.push((rule as CSSStyleRule).selectorText)
    }
  }
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules)
    } catch {} // another origin's sheet
  }
  return found.join(',')
}

/** warp.flow's fallback, only where view() is missing. It hides nothing until it has seen an element below the fold, so failed JS can't trap content. */
export function flow(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (installed || !doc || typeof IntersectionObserver === 'undefined' || CSS.supports('animation-timeline: view()')) return
  installed = true
  let sel = '', sheets = -1
  const current = () => {
    if (!sel && doc.styleSheets.length !== sheets) { sheets = doc.styleSheets.length; sel = families(doc) } // read again only when a sheet arrives
    return sel
  }
  const gated = (el: Element) => !el.isConnected || getComputedStyle(el).getPropertyValue('--warp-flow-gate').trim() === 'none'
  const io = new IntersectionObserver(entries => {
    for (const { target, isIntersecting, boundingClientRect: r } of entries) {
      const el = target as HTMLElement
      if (isIntersecting) { if (el.dataset.flowState === 'wait') el.dataset.flowState = 'in' }
      else if (r.top > 0 && !gated(el)) el.dataset.flowState = 'wait'
    }
  }, { rootMargin: '0px 0px -8% 0px' })
  const watch = (node: Node) => {
    if (node.nodeType !== 1) return
    if (!sel) { if (!current()) return; node = doc.documentElement } // the sheet came late: take in what was already there
    const el = node as Element
    if (el.matches(sel)) io.observe(el)
    for (const f of el.querySelectorAll(sel)) io.observe(f)
  }
  watch(doc.documentElement)
  new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(watch) }).observe(doc.documentElement, { childList: true, subtree: true })
}
