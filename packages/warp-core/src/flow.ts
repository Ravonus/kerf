let installed = false

/**
 * warp.flow waits for a person. Until the first scroll the gate is shut (`:root:not([data-flow-armed])`), so the page
 * holds still and whole: what the first screen, a crawler and an audit read is every word at full contrast, never text
 * parked at opacity 0 below the fold. On that scroll, what is on screen is marked seen and stays put (no part-faded jump),
 * and everything below rises in as it arrives. Once a seen element has left the screen it flows like the rest. Without this script nothing is armed, so failed JS leaves a still page.
 */
export function flow(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (installed || !doc) return
  installed = true
  const root = doc.documentElement
  const arm = () => {
    seen(doc)
    root.dataset.flowArmed = ''
    release(doc)
    fallback(doc)
  }
  if (root.hasAttribute('data-flow-armed')) fallback(doc)
  else doc.addEventListener('scroll', arm, { capture: true, once: true, passive: true })
}

/**
 * Mark what is on screen. warp.flow gives every element it moves `--_flow-in`, so this finds them without naming a
 * component (a selector here would keep that component's CSS in every bundle). Only the subtrees on screen are walked,
 * and below a marked element nothing is: `data-flow-seen` shuts the gate for its whole subtree.
 */
function seen(doc: Document) {
  const h = doc.defaultView?.innerHeight ?? 0
  const walk = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_ELEMENT)
  const skip = () => { while (!walk.nextSibling()) if (!walk.parentNode()) return false; return true }
  let more = !!walk.firstChild()
  while (more) {
    const el = walk.currentNode as HTMLElement
    const r = el.getBoundingClientRect()
    const onScreen = r.top < h && r.bottom > 0
    if (onScreen && getComputedStyle(el).getPropertyValue('--_flow-in').trim()) el.dataset.flowSeen = ''
    // a box off screen can still hold one that is on it (a fixed bar, an overflow), but warp's flowed blocks sit in the flow
    more = onScreen && !el.hasAttribute('data-flow-seen') ? !!walk.firstChild() || skip() : skip()
  }
}

/** A seen element that leaves the screen (the page, or a window it scrolls in) flows again: off screen, nothing jumps. */
function release(doc: Document) {
  const IO = doc.defaultView?.IntersectionObserver
  if (!IO) return
  const io = new IO(entries => {
    for (const e of entries) if (!e.isIntersecting) { delete (e.target as HTMLElement).dataset.flowSeen; io.unobserve(e.target) }
  })
  for (const el of doc.querySelectorAll('[data-flow-seen]')) io.observe(el)
}

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

/** Only where view() is missing. It hides nothing until it has seen an element below the fold, so failed JS can't trap content. */
function fallback(doc: Document) {
  if (typeof IntersectionObserver === 'undefined' || CSS.supports('animation-timeline: view()')) return
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
