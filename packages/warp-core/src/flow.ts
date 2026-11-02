const FAMILIES = '[data-scope="surface"],[data-scope="tile"],[data-scope="listing"],[data-scope="plan"],[data-scope="quote"],[data-scope="post"],[data-scope="table"] tbody>tr,[data-scope="list"]>li,[data-scope="timeline"]>li,[data-scope="stat"],[data-scope="chart"],[data-scope="gallery"] [data-part="item"],figure,[data-part="head"]>:is(h1,h2,h3),[data-scope="codeblock"],[data-scope="form"]>*,[data-scope="kanban"] [data-part="card"],[data-flow]:not([data-flow="off"])'
let installed = false

/** warp.flow's fallback, only where view() is missing. It hides nothing until it has seen an element below the fold, so failed JS can't trap content. */
export function flow(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (installed || !doc || typeof IntersectionObserver === 'undefined' || CSS.supports('animation-timeline: view()')) return
  installed = true
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
