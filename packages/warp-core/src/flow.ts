const FAMILIES = '[data-scope="surface"],[data-scope="tile"],[data-scope="listing"],[data-scope="plan"],[data-scope="quote"],[data-scope="post"],[data-scope="table"] tbody>tr,[data-scope="list"]>li,[data-scope="timeline"]>li,[data-scope="stat"],[data-scope="chart"],[data-scope="gallery"] [data-part="item"],figure,[data-part="head"]>:is(h1,h2,h3),[data-scope="codeblock"],[data-scope="form"]>*,[data-scope="kanban"] [data-part="card"],[data-flow]:not([data-flow="off"])'
let installed = false

/**
 * warp.flow waits for a person. Until the first scroll the gate is shut (`:root:not([data-flow-armed])`), so the page
 * holds still and whole: what the first screen, a crawler and an audit read is every word at full contrast, never text
 * parked at opacity 0 below the fold. On that scroll, what is on screen is marked seen and stays put (no part-faded jump),
 * and everything below rises in as it arrives. Without this script nothing is armed, so failed JS leaves a still page.
 */
export function flow(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (installed || !doc) return
  installed = true
  const root = doc.documentElement
  const arm = () => {
    seen(doc)
    root.dataset.flowArmed = ''
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

/** Only where view() is missing. It hides nothing until it has seen an element below the fold, so failed JS can't trap content. */
function fallback(doc: Document) {
  if (typeof IntersectionObserver === 'undefined' || CSS.supports('animation-timeline: view()')) return
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
    const el = node as Element
    if (el.matches(FAMILIES)) io.observe(el)
    for (const f of el.querySelectorAll(FAMILIES)) io.observe(f)
  }
  watch(doc.documentElement)
  new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(watch) }).observe(doc.documentElement, { childList: true, subtree: true })
}
